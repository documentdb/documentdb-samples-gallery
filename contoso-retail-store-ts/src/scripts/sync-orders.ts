import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const DB_NAME = process.env["DB_NAME"] ?? "retaildb";

interface StoreSource {
  name: string;
  uri: string;
}

const STORES: StoreSource[] = [];
if (process.env["PRIMARY_URI"]) {
  STORES.push({ name: "Local Primary (:10260)", uri: process.env["PRIMARY_URI"] });
}
if (process.env["HQ_REPLICA_URI"]) {
  STORES.push({ name: "Seattle Store (:10261)", uri: process.env["HQ_REPLICA_URI"] });
}
if (process.env["WAREHOUSE_REPLICA_URI"]) {
  STORES.push({ name: "Chicago Store (:10262)", uri: process.env["WAREHOUSE_REPLICA_URI"] });
}

const azureUri = process.env["DOCUMENTDB_URI"];
if (!azureUri) {
  console.error("❌ DOCUMENTDB_URI not set. Cannot sync to Azure.");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("🔄 Syncing orders from all stores → Global Database\n");
  console.log(`   Azure: ${azureUri!.replace(/\/\/.*@/, "//***@")}\n`);

  const azure = new MongoClient(azureUri!);
  try {
    await azure.connect();
    console.log("   ✅ Connected to Global Database");
    const azureDb = azure.db(DB_NAME);
    const azureOrders = azureDb.collection("orders");

    // Get existing Azure order IDs to avoid duplicates
    const existingIds = new Set(
      (await azureOrders.find({}, { projection: { _id: 1 } }).toArray())
        .map(d => d._id.toString())
    );
    console.log(`   Azure has ${existingIds.size} existing orders\n`);

    let totalSynced = 0;

    for (const store of STORES) {
      console.log(`📡 Checking ${store.name}...`);
      const storeClient = new MongoClient(store.uri);
      try {
        await storeClient.connect();
        const storeDb = storeClient.db(DB_NAME);
        const storeOrders = await storeDb.collection("orders").find({}).toArray();

        if (storeOrders.length === 0) {
          console.log(`   No orders in ${store.name}\n`);
          continue;
        }

        // Filter to only new orders not already in Azure
        const newOrders = storeOrders.filter(o => !existingIds.has(o._id.toString()));

        if (newOrders.length === 0) {
          console.log(`   ${store.name}: ${storeOrders.length} orders (all already synced)\n`);
          continue;
        }

        // Add store origin metadata before syncing
        const enrichedOrders = newOrders.map(o => ({
          ...o,
          _syncedFrom: store.name,
          _syncedAt: new Date(),
        }));

        await azureOrders.insertMany(enrichedOrders);
        totalSynced += newOrders.length;

        // Track these as synced
        newOrders.forEach(o => existingIds.add(o._id.toString()));

        console.log(`   ${store.name}: ${newOrders.length} new orders synced ✅ (${storeOrders.length - newOrders.length} already existed)\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`   ⚠️ ${store.name}: ${msg}\n`);
      } finally {
        await storeClient.close().catch(() => {});
      }
    }

    console.log(`\n🎉 Sync complete! ${totalSynced} new orders pushed to Azure.`);
    console.log(`   Azure now has ${existingIds.size} total orders.`);
  } finally {
    await azure.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
