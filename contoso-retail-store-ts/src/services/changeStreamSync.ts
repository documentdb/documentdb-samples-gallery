import { MongoClient } from "mongodb";
import { config } from "../config/index.js";

type SyncLogger = (msg: string) => void;

interface StoreConfig {
  name: string;
  key: string;
  uri: string;
  warehouseId: string;
}

const STORES: StoreConfig[] = [
  { name: "Seattle Store", key: "hq", uri: config.hqReplicaUri, warehouseId: "WH-SEATTLE" },
  { name: "Chicago Store", key: "warehouse", uri: config.warehouseReplicaUri, warehouseId: "WH-CHICAGO" },
];

let disasterMode = false;
let pendingChanges: Array<{ store: string; collection: string; sku?: string; warehouseId?: string }> = [];
let logger: SyncLogger = console.log;
let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Track last-known inventory state per store so we can detect changes
const lastKnownInventory = new Map<string, Map<string, number>>(); // "storeName:sku:wh" → qty

export function setLogger(fn: SyncLogger): void {
  logger = fn;
}

export function isDisasterMode(): boolean {
  return disasterMode;
}

export function getPendingCount(): number {
  return pendingChanges.length;
}

export function isRunning(): boolean {
  return running;
}

export async function enableDisasterMode(): Promise<void> {
  disasterMode = true;
  logger("🔴 DISASTER MODE ON — cloud sync paused, writes go to local DB only");
}

export async function disableDisasterMode(): Promise<void> {
  disasterMode = false;
  logger("🟢 DISASTER MODE OFF — connection restored, flushing pending changes...");

  if (pendingChanges.length > 0) {
    await flushPendingChanges();
  } else {
    logger("   No pending changes to flush");
  }
}

async function flushPendingChanges(): Promise<void> {
  const azure = new MongoClient(config.documentdbUri);
  try {
    await azure.connect();
    const azureDb = azure.db(config.dbName);
    let ordersSynced = 0;
    let invSynced = 0;

    // Flush inventory: re-read current values from each store and push to Azure
    for (const store of STORES) {
      const client = new MongoClient(store.uri);
      try {
        await client.connect();
        const storeDb = client.db(config.dbName);
        const storeInv = await storeDb.collection("inventory")
          .find({ warehouseId: store.warehouseId }).toArray();
        for (const rec of storeInv) {
          await azureDb.collection("inventory").updateOne(
            { sku: rec.sku, warehouseId: rec.warehouseId },
            { $set: { quantityOnHand: rec.quantityOnHand, lastUpdated: rec.lastUpdated } }
          );
          invSynced++;
        }

        // Flush orders
        const azureOrderIds = new Set(
          (await azureDb.collection("orders").find({}, { projection: { _id: 1 } }).toArray())
            .map(d => d._id.toString())
        );
        const storeOrders = await storeDb.collection("orders").find({}).toArray();
        const newOrders = storeOrders.filter(o => !azureOrderIds.has(o._id.toString()));
        if (newOrders.length > 0) {
          const enriched = newOrders.map(o => ({ ...o, _syncedFrom: store.name, _syncedAt: new Date() }));
          await azureDb.collection("orders").insertMany(enriched);
          ordersSynced += newOrders.length;
        }
      } finally {
        await client.close().catch(() => {});
      }
    }

    const flushed = pendingChanges.length;
    pendingChanges = [];
    logger(`   ✅ Flushed ${flushed} queued changes → Global Database (${ordersSynced} orders + ${invSynced} inventory)`);
  } finally {
    await azure.close().catch(() => {});
  }
}

async function pollForChanges(): Promise<void> {
  if (disasterMode) return; // Don't sync while in disaster mode

  for (const store of STORES) {
    const client = new MongoClient(store.uri);
    try {
      await client.connect();
      const storeDb = client.db(config.dbName);

      // Check inventory for this store's warehouse
      const storeInv = await storeDb.collection("inventory")
        .find({ warehouseId: store.warehouseId }).toArray();

      const azure = new MongoClient(config.documentdbUri);
      try {
        await azure.connect();
        const azureDb = azure.db(config.dbName);
        let synced = 0;

        for (const rec of storeInv) {
          const key = `${store.key}:${rec.sku}:${rec.warehouseId}`;
          const lastQty = lastKnownInventory.get(key);

          if (lastQty !== undefined && lastQty !== rec.quantityOnHand) {
            // Changed since last poll — sync to Azure
            await azureDb.collection("inventory").updateOne(
              { sku: rec.sku, warehouseId: rec.warehouseId },
              { $set: { quantityOnHand: rec.quantityOnHand, lastUpdated: rec.lastUpdated } }
            );
            synced++;
            logger(`   ⚡ Auto-synced ${rec.sku}/${rec.warehouseId} → Global (qty: ${rec.quantityOnHand})`);
          }
          lastKnownInventory.set(key, rec.quantityOnHand);
        }

        // Check for new orders
        const azureOrderIds = new Set(
          (await azureDb.collection("orders").find({}, { projection: { _id: 1 } }).toArray())
            .map(d => d._id.toString())
        );
        const storeOrders = await storeDb.collection("orders").find({}).toArray();
        const newOrders = storeOrders.filter(o => !azureOrderIds.has(o._id.toString()));
        if (newOrders.length > 0) {
          const enriched = newOrders.map(o => ({ ...o, _syncedFrom: store.name, _syncedAt: new Date() }));
          await azureDb.collection("orders").insertMany(enriched);
          logger(`   ⚡ Auto-synced ${newOrders.length} new orders from ${store.name} → Global`);
        }
      } finally {
        await azure.close().catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Silent on routine poll failures
      if (!msg.includes("connect")) {
        logger(`   ⚠️ Poll error for ${store.name}: ${msg}`);
      }
    } finally {
      await client.close().catch(() => {});
    }
  }
}

// Track changes while in disaster mode (called by inventory/order routes)
export function trackLocalChange(collection: string, storeName: string, details?: { sku?: string; warehouseId?: string }): void {
  if (!disasterMode) return;
  pendingChanges.push({ store: storeName, collection, ...details });
}

export async function startChangeStreams(): Promise<void> {
  if (running) return;
  running = true;

  // Seed initial inventory state so we can detect future changes
  for (const store of STORES) {
    const client = new MongoClient(store.uri);
    try {
      await client.connect();
      const storeDb = client.db(config.dbName);
      const inv = await storeDb.collection("inventory")
        .find({ warehouseId: store.warehouseId }).toArray();
      for (const rec of inv) {
        lastKnownInventory.set(`${store.key}:${rec.sku}:${rec.warehouseId}`, rec.quantityOnHand);
      }
    } finally {
      await client.close().catch(() => {});
    }
  }

  // Poll every 5 seconds
  pollTimer = setInterval(() => {
    pollForChanges().catch(() => {});
  }, 5000);

  logger("👁️ Live sync active — polling local stores every 5s");
}

export async function stopChangeStreams(): Promise<void> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastKnownInventory.clear();
  pendingChanges = [];
  running = false;
  logger("🛑 Live sync stopped");
}

/* ── Bi-directional: Azure → Local stores ── */
export async function syncAzureToLocal(): Promise<{ ordersSynced: number; invSynced: number }> {
  logger("🔄 Sync started: Global Database → local stores");

  const azure = new MongoClient(config.documentdbUri);
  let totalOrders = 0;
  let totalInv = 0;

  try {
    await azure.connect();
    const azureDb = azure.db(config.dbName);

    const azureOrders = await azureDb.collection("orders").find({}).toArray();
    const azureInventory = await azureDb.collection("inventory").find({}).toArray();

    for (const store of STORES) {
      const client = new MongoClient(store.uri);
      try {
        await client.connect();
        const storeDb = client.db(config.dbName);

        // Sync orders: Azure → local
        const localOrderIds = new Set(
          (await storeDb.collection("orders").find({}, { projection: { _id: 1 } }).toArray())
            .map(d => d._id.toString())
        );
        const newOrders = azureOrders.filter(o => !localOrderIds.has(o._id.toString()));
        if (newOrders.length > 0) {
          await storeDb.collection("orders").insertMany(newOrders);
          totalOrders += newOrders.length;
        }
        logger(`   ${store.name}: ${newOrders.length} new orders pulled`);

        // Sync inventory: Azure → local (only this store's warehouse)
        const storeInv = azureInventory.filter(r => r.warehouseId === store.warehouseId);
        let storeInvCount = 0;
        for (const rec of storeInv) {
          await storeDb.collection("inventory").updateOne(
            { sku: rec.sku, warehouseId: rec.warehouseId },
            { $set: { quantityOnHand: rec.quantityOnHand, lastUpdated: rec.lastUpdated } }
          );
          storeInvCount++;
        }
        totalInv += storeInvCount;
        logger(`   ${store.name}: ${storeInvCount} inventory records updated`);

        // Update tracking map so poller doesn't re-sync stale diffs
        for (const rec of storeInv) {
          lastKnownInventory.set(`${store.key}:${rec.sku}:${rec.warehouseId}`, rec.quantityOnHand);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger(`   ${store.name}: ⚠️ ${msg}`);
      } finally {
        await client.close().catch(() => {});
      }
    }

    logger(`🎉 Pull complete! ${totalOrders} orders + ${totalInv} inventory → local stores`);
    return { ordersSynced: totalOrders, invSynced: totalInv };
  } finally {
    await azure.close().catch(() => {});
  }
}
