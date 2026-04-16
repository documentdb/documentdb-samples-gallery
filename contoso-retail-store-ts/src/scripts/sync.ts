import { MongoClient } from "mongodb";
import { config } from "../config/index.js";

const COLLECTIONS = ["products", "inventory", "orders"];

async function sync(): Promise<void> {
  const sourceUri = config.primaryUri;
  const targetUri = config.documentdbUri;

  if (sourceUri === targetUri) {
    console.error("❌ PRIMARY_URI and DOCUMENTDB_URI are the same. Set DOCUMENTDB_URI to your Azure connection string.");
    process.exit(1);
  }

  console.log("🔄 Syncing local → Global Database\n");
  console.log(`   Source: ${sourceUri.replace(/\/\/.*@/, "//***@")}`);
  console.log(`   Target: ${targetUri.replace(/\/\/.*@/, "//***@")}\n`);

  const source = new MongoClient(sourceUri);
  const target = new MongoClient(targetUri);

  try {
    await source.connect();
    console.log("✅ Connected to local (source)");
    await target.connect();
    console.log("✅ Connected to Azure (target)\n");

    const sourceDb = source.db(config.dbName);
    const targetDb = target.db(config.dbName);

    for (const name of COLLECTIONS) {
      const docs = await sourceDb.collection(name).find({}).toArray();
      if (docs.length === 0) {
        console.log(`   ${name}: empty, skipping`);
        continue;
      }

      // Drop target collection first to avoid duplicates
      try {
        await targetDb.dropCollection(name);
      } catch {
        // Collection may not exist yet — that's fine
      }

      await targetDb.collection(name).insertMany(docs);
      console.log(`   ${name}: ${docs.length} documents synced ✅`);
    }

    // Re-create indexes on target
    console.log("\n🔍 Recreating indexes on Azure...");
    for (const name of COLLECTIONS) {
      const sourceIndexes = await sourceDb.collection(name).indexes();
      for (const idx of sourceIndexes) {
        if (idx.name === "_id_") continue;
        try {
          await targetDb.collection(name).createIndex(idx.key, {
            name: idx.name,
            ...(idx.textIndexVersion ? { default_language: "english" } : {}),
          });
          console.log(`   ${name}.${idx.name} ✅`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("already exists")) {
            console.log(`   ${name}.${idx.name} (already exists)`);
          } else {
            console.log(`   ${name}.${idx.name} ⚠️ ${msg}`);
          }
        }
      }
    }

    // Vector index (special command)
    try {
      await targetDb.command({
        createIndexes: "products",
        indexes: [{
          name: "vector_index",
          key: { embedding: "cosmosSearch" },
          cosmosSearchOptions: {
            kind: "vector-hnsw",
            m: 16,
            efConstruction: 64,
            similarity: "COS",
            dimensions: config.embeddingDimensions,
          },
        }],
      });
      console.log("   products.vector_index ✅");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log("   products.vector_index (already exists)");
      } else {
        console.log(`   products.vector_index ⚠️ ${msg}`);
      }
    }

    console.log("\n🎉 Sync complete! Your Global Database now has the same data as local.");
  } finally {
    await source.close();
    await target.close();
  }
}

sync().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
