import "dotenv/config";
import { MongoClient } from "mongodb";

const DB_NAME = process.env["DB_NAME"] ?? "retaildb";

// Clear orders from replica stores so each store starts fresh.
// Only Azure keeps the full consolidated order history.

const targets = [
  { name: "Chicago Store (:10262)", uri: process.env["WAREHOUSE_REPLICA_URI"]! },
  { name: "Seattle Store (:10261)", uri: process.env["HQ_REPLICA_URI"]! },
  { name: "Local Primary (:10260)", uri: process.env["PRIMARY_URI"]! },
];

async function main() {
  for (const t of targets) {
    if (!t.uri) continue;
    const client = new MongoClient(t.uri);
    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const before = await db.collection("orders").countDocuments();
      await db.collection("orders").deleteMany({});
      console.log(`${t.name}: cleared ${before} orders ✅`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${t.name}: ⚠️ ${msg}`);
    } finally {
      await client.close().catch(() => {});
    }
  }
  console.log("\nAll local stores cleared. Each store will now accumulate its own orders.");
  console.log("Azure retains the consolidated order history.");
}

main().catch(console.error);
