import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/index.js";
import { connectDb, getDb, getActiveTarget, type DbTargetKey } from "./db/client.js";
import { ensureIndexes } from "./services/productService.js";
import productsRouter from "./routes/products.js";
import inventoryRouter from "./routes/inventory.js";
import ordersRouter from "./routes/orders.js";
import recommendationsRouter from "./routes/recommendations.js";
import replicationRouter from "./routes/replication.js";
import {
  setLogger as setSyncLogger,
  startChangeStreams,
  stopChangeStreams,
  enableDisasterMode,
  disableDisasterMode,
  isDisasterMode,
  getPendingCount,
  isRunning as isSyncRunning,
  syncAzureToLocal,
} from "./services/changeStreamSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Server-Sent Event log bus ── */
type LogClient = express.Response;
const logClients = new Set<LogClient>();

export function pushLog(message: string): void {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = `[${ts}] ${message}`;
  for (const client of logClients) {
    client.write(`data: ${JSON.stringify(line)}\n\n`);
  }
  // Also print to server stdout
  console.log(line);
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

/* ── Log stream SSE endpoint ── */
app.get("/logs", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify("[connected] Live log stream active")}\n\n`);
  logClients.add(res);
  _req.on("close", () => logClients.delete(res));
});

/* ── DB target switch ── */
const VALID_TARGETS: DbTargetKey[] = ["azure", "hq", "warehouse"];

app.get("/db-target", (_req, res) => {
  const { key, label } = getActiveTarget();
  res.json({ target: key, label });
});

app.post("/db-target", async (req, res) => {
  const { target } = req.body as { target: string };
  if (!VALID_TARGETS.includes(target as DbTargetKey)) {
    res.status(400).json({ error: `target must be one of: ${VALID_TARGETS.join(", ")}` });
    return;
  }
  const newTarget = target as DbTargetKey;
  const { key: currentKey } = getActiveTarget();
  if (newTarget === currentKey) {
    res.json({ target: newTarget, label: getActiveTarget().label, message: "Already connected" });
    return;
  }
  pushLog(`Switching database target: ${currentKey} → ${newTarget}...`);
  try {
    await connectDb(newTarget);
    await ensureIndexes();
    const { label } = getActiveTarget();
    pushLog(`✅ Now connected to ${label}`);
    res.json({ target: newTarget, label });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog(`❌ Failed to connect to ${newTarget}: ${msg}`);
    // Reconnect to previous target
    try { await connectDb(currentKey); } catch { /* best effort */ }
    res.status(500).json({ error: `Failed to connect to ${newTarget}: ${msg}` });
  }
});

/* ── Sync: local stores → Azure ── */
import { MongoClient } from "mongodb";

app.post("/sync", async (_req, res) => {
  const azureUri = config.documentdbUri;
  const stores: { name: string; uri: string }[] = [];

  if (config.primaryUri) stores.push({ name: "Local Primary", uri: config.primaryUri, warehouseFilter: null });
  if (config.hqReplicaUri) stores.push({ name: "Seattle Store", uri: config.hqReplicaUri, warehouseFilter: "WH-SEATTLE" });
  if (config.warehouseReplicaUri) stores.push({ name: "Chicago Store", uri: config.warehouseReplicaUri, warehouseFilter: "WH-CHICAGO" });

  pushLog("🔄 Sync started: local stores → Global Database");

  const azure = new MongoClient(azureUri);
  try {
    await azure.connect();
    const azureDb = azure.db(config.dbName);
    const azureOrders = azureDb.collection("orders");

    const existingIds = new Set(
      (await azureOrders.find({}, { projection: { _id: 1 } }).toArray())
        .map(d => d._id.toString())
    );
    pushLog(`   Azure has ${existingIds.size} existing orders`);

    let totalSynced = 0;
    const syncedOrderIds: { id: string; store: string; customerId: string; totalAmount: number }[] = [];

    for (const store of stores) {
      const client = new MongoClient(store.uri);
      try {
        await client.connect();
        const storeOrders = await client.db(config.dbName).collection("orders").find({}).toArray();
        const newOrders = storeOrders.filter(o => !existingIds.has(o._id.toString()));

        if (newOrders.length === 0) {
          pushLog(`   ${store.name}: ${storeOrders.length} orders (all synced)`);
          continue;
        }

        const enriched = newOrders.map(o => ({ ...o, _syncedFrom: store.name, _syncedAt: new Date() }));
        await azureOrders.insertMany(enriched);
        newOrders.forEach(o => {
          existingIds.add(o._id.toString());
          syncedOrderIds.push({ id: o._id.toString(), store: store.name, customerId: o.customerId, totalAmount: o.totalAmount });
        });
        totalSynced += newOrders.length;
        pushLog(`   ${store.name}: ${newOrders.length} new orders synced ✅`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        pushLog(`   ${store.name}: ⚠️ ${msg}`);
      } finally {
        await client.close().catch(() => {});
      }
    }

    /* ── Sync inventory from local stores → Azure ── */
    const azureInv = azureDb.collection("inventory");
    let invSynced = 0;

    for (const store of stores) {
      if (!store.warehouseFilter) continue; // skip Local Primary (same as azure)
      const client = new MongoClient(store.uri);
      try {
        await client.connect();
        const storeInv = await client.db(config.dbName).collection("inventory")
          .find({ warehouseId: store.warehouseFilter }).toArray();
        for (const rec of storeInv) {
          await azureInv.updateOne(
            { sku: rec.sku, warehouseId: rec.warehouseId },
            { $set: { quantityOnHand: rec.quantityOnHand, lastUpdated: rec.lastUpdated } }
          );
          invSynced++;
        }
        pushLog(`   ${store.name}: ${storeInv.length} inventory records synced ✅`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        pushLog(`   ${store.name}: ⚠️ inventory sync error: ${msg}`);
      } finally {
        await client.close().catch(() => {});
      }
    }

    pushLog(`🎉 Sync complete! ${totalSynced} new orders + ${invSynced} inventory records → Azure (${existingIds.size} total orders)`);
    res.json({ synced: totalSynced, inventorySynced: invSynced, totalAzure: existingIds.size, syncedOrders: syncedOrderIds });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog(`❌ Sync failed: ${msg}`);
    res.status(500).json({ error: msg });
  } finally {
    await azure.close().catch(() => {});
  }
});

/* ── Disaster Mode ── */
app.get("/disaster", (_req, res) => {
  res.json({ active: isDisasterMode(), pending: getPendingCount(), syncRunning: isSyncRunning() });
});

app.post("/disaster", async (req, res) => {
  const { active } = req.body as { active: boolean };
  if (active) {
    await enableDisasterMode();
    res.json({ active: true, pending: getPendingCount() });
  } else {
    await disableDisasterMode();
    res.json({ active: false, pending: getPendingCount() });
  }
});

/* ── Change Stream Sync control ── */
app.post("/change-streams/start", async (_req, res) => {
  await startChangeStreams();
  res.json({ running: true });
});

app.post("/change-streams/stop", async (_req, res) => {
  await stopChangeStreams();
  res.json({ running: false });
});

/* ── Bi-directional: Azure → Local ── */
app.post("/sync-from-azure", async (_req, res) => {
  try {
    const result = await syncAzureToLocal();
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog(`❌ Pull from Azure failed: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

app.use("/products", productsRouter);
app.use("/inventory", inventoryRouter);
app.use("/orders", ordersRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/replication", replicationRouter);

app.get("/health", async (_req, res) => {
  const { key, label } = getActiveTarget();

  const start = performance.now();
  try {
    await getDb().command({ ping: 1 });
    const latencyMs = Math.round(performance.now() - start);
    res.json({ status: "ok", dbTarget: key, dbLabel: label, latencyMs });
  } catch {
    const latencyMs = Math.round(performance.now() - start);
    res.status(503).json({ status: "error", dbTarget: key, dbLabel: label, latencyMs });
  }
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
);

async function start(): Promise<void> {
  await connectDb();
  await ensureIndexes();

  // Wire change stream logger to SSE bus
  setSyncLogger(pushLog);

  // Start change streams to auto-sync local stores → Global
  try {
    await startChangeStreams();
  } catch (err) {
    console.error("⚠️ Could not start change streams:", err);
  }

  app.listen(config.port, () => {
    pushLog(`🚀 retail-docdb-demo listening on http://localhost:${config.port}`);
    pushLog(`📦 DB target: ${getActiveTarget().label}`);
  });
}

start().catch((err) => {
  console.error("❌ Failed to start:", err);
  process.exit(1);
});
