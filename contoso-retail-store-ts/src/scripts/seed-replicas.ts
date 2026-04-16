import "dotenv/config";
import { MongoClient } from "mongodb";

const DB_NAME = process.env["DB_NAME"] ?? "retaildb";
const DIMENSIONS = parseInt(process.env["EMBEDDING_DIMENSIONS"] ?? "768", 10);

interface TargetDef {
  name: string;
  uri: string;
}

const targets: TargetDef[] = [];

// Determine which targets to seed based on CLI args (or all)
const args = process.argv.slice(2);
const seedHq = args.length === 0 || args.includes("hq");
const seedWarehouse = args.length === 0 || args.includes("warehouse");

if (seedHq && process.env["HQ_REPLICA_URI"]) {
  targets.push({ name: "Seattle Store", uri: process.env["HQ_REPLICA_URI"] });
}
if (seedWarehouse && process.env["WAREHOUSE_REPLICA_URI"]) {
  targets.push({ name: "Chicago Store", uri: process.env["WAREHOUSE_REPLICA_URI"] });
}

if (targets.length === 0) {
  console.error("❌ No replica URIs configured. Check HQ_REPLICA_URI / WAREHOUSE_REPLICA_URI in .env");
  process.exit(1);
}

// Source: primary local instance
const sourceUri = process.env["PRIMARY_URI"];
if (!sourceUri) {
  console.error("❌ PRIMARY_URI not set in .env");
  process.exit(1);
}

const COLLECTIONS = ["products", "inventory"];
// Orders are NOT seeded — each store accumulates its own orders independently.
// Use `npm run sync:orders` to push orders from stores → Azure.

async function seedTarget(target: TargetDef, source: MongoClient): Promise<void> {
  console.log(`\n📦 Seeding ${target.name}...`);
  console.log(`   Target: ${target.uri.replace(/\/\/.*@/, "//***@")}`);

  const dest = new MongoClient(target.uri);
  try {
    await dest.connect();
    console.log(`   ✅ Connected to ${target.name}`);

    const sourceDb = source.db(DB_NAME);
    const destDb = dest.db(DB_NAME);

    for (const name of COLLECTIONS) {
      const docs = await sourceDb.collection(name).find({}).toArray();
      if (docs.length === 0) {
        console.log(`   ${name}: empty in source, skipping`);
        continue;
      }

      // Drop + re-insert to avoid duplicates
      try { await destDb.dropCollection(name); } catch { /* may not exist */ }
      await destDb.collection(name).insertMany(docs);
      console.log(`   ${name}: ${docs.length} documents ✅`);
    }

    // Re-create indexes
    console.log(`   Creating indexes...`);
    for (const name of COLLECTIONS) {
      const sourceIndexes = await sourceDb.collection(name).indexes();
      for (const idx of sourceIndexes) {
        if (idx.name === "_id_") continue;
        // Skip vector indexes — handled separately
        if (idx.name === "vector_index") continue;
        try {
          await destDb.collection(name).createIndex(idx.key, {
            name: idx.name,
            ...(idx.textIndexVersion ? { default_language: "english" } : {}),
          });
          console.log(`   ${name}.${idx.name} ✅`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("already exists")) {
            console.log(`   ${name}.${idx.name} (exists)`);
          } else {
            console.log(`   ${name}.${idx.name} ⚠️ ${msg}`);
          }
        }
      }
    }

    // Vector index
    try {
      await destDb.command({
        createIndexes: "products",
        indexes: [{
          name: "vector_index",
          key: { embedding: "cosmosSearch" },
          cosmosSearchOptions: {
            kind: "vector-hnsw",
            m: 16,
            efConstruction: 64,
            similarity: "COS",
            dimensions: DIMENSIONS,
          },
        }],
      });
      console.log(`   products.vector_index ✅`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log(`   products.vector_index (exists)`);
      } else {
        console.log(`   products.vector_index ⚠️ ${msg}`);
      }
    }

    console.log(`   ✅ ${target.name} seeded successfully`);
  } finally {
    await dest.close().catch(() => {});
  }
}

async function main(): Promise<void> {
  console.log("🔄 Seeding replica databases from primary\n");
  console.log(`   Source: ${sourceUri!.replace(/\/\/.*@/, "//***@")}`);

  const source = new MongoClient(sourceUri!);
  try {
    await source.connect();
    console.log("   ✅ Connected to primary (source)");

    // Verify source has data
    const productCount = await source.db(DB_NAME).collection("products").countDocuments();
    console.log(`   Source has ${productCount} products`);

    if (productCount === 0) {
      console.log("\n⚠️  Primary has no products. Run 'npm run seed' first.");
      process.exit(1);
    }

    for (const target of targets) {
      await seedTarget(target, source);
    }

    console.log("\n🎉 All replicas seeded!");
  } finally {
    await source.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
