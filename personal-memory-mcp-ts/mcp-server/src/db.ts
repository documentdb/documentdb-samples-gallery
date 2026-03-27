import { MongoClient, Db, Collection } from "mongodb";
import type { Memory, ProfileDocument } from "./types.js";
import { logger } from "./logger.js";
import { isOllamaAvailable, getEmbeddingDimensions } from "./embeddings.js";

let client: MongoClient | null = null;
let db: Db | null = null;

const DOCUMENTDB_URI = process.env.DOCUMENTDB_URI || "";
const DB_NAME = process.env.DB_NAME || "personal_memory";

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  if (!DOCUMENTDB_URI) {
    throw new Error(
      "DOCUMENTDB_URI is required. Set it in .env or as an environment variable.\n" +
      "Example: mongodb://user:password@localhost:10260/personal_memory?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&directConnection=true"
    );
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      client = new MongoClient(DOCUMENTDB_URI);
      await client.connect();
      db = client.db(DB_NAME);
      await ensureIndexes(db);
      logger.info("Connected to DocumentDB");

      // Reconnection on unexpected close
      client.on("close", () => {
        logger.warn("DB connection lost — will reconnect on next request");
        db = null;
        client = null;
      });

      return db;
    } catch (err) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      logger.error({ attempt, maxRetries: MAX_RETRIES, err }, "DB connection attempt failed");
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to connect to DocumentDB after ${MAX_RETRIES} attempts. ` +
          `Check DOCUMENTDB_URI and ensure the database is running.`,
          { cause: err }
        );
      }
      logger.info({ delay }, "Retrying DB connection");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

async function ensureIndexes(db: Db): Promise<void> {
  const memories = db.collection("memories");
  await memories.createIndex({ category: 1, active: 1, created_at: -1 });
  await memories.createIndex({ tags: 1 });
  await memories.createIndex({ active: 1, importance: 1 });
  await memories.createIndex(
    { content: "text" },
    { default_language: "english" }
  );

  // Vector index for semantic search (requires Ollama for embeddings)
  if (await isOllamaAvailable()) {
    try {
      await db.command({
        createIndexes: "memories",
        indexes: [
          {
            key: { embedding: "cosmosSearch" },
            name: "idx_memory_embedding",
            cosmosSearchOptions: {
              kind: "vector-ivf",
              numLists: 1,
              similarity: "COS",
              dimensions: getEmbeddingDimensions(),
            },
          },
        ],
      });
      logger.info("Vector search index ensured");
    } catch (err) {
      logger.warn({ err }, "Vector index creation failed — semantic search disabled");
    }
  }

  logger.info("DB indexes ensured");
}

export function getMemoriesCollection(): Collection<Memory> {
  if (!db) throw new Error("Database not connected");
  return db.collection<Memory>("memories");
}

export function getProfileCollection(): Collection<ProfileDocument> {
  if (!db) throw new Error("Database not connected");
  return db.collection<ProfileDocument>("profile");
}
