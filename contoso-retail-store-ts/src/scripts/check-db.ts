import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env["WAREHOUSE_REPLICA_URI"]!;
console.log("Checking:", uri.replace(/\/\/.*@/, "//***@"));

const client = new MongoClient(uri);
await client.connect();
const db = client.db("retaildb");
const colls = await db.listCollections().toArray();
console.log("Collections:", colls.length ? colls.map(x => x.name).join(", ") : "(empty)");
for (const col of colls) {
  console.log(`  ${col.name}: ${await db.collection(col.name).countDocuments()}`);
}
await client.close();
