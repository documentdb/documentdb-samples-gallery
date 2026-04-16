import { MongoClient, Db } from "mongodb";
import { config } from "../config/index.js";

export type DbTargetKey = "azure" | "hq" | "warehouse";

const URI_MAP: Record<DbTargetKey, string> = {
  azure: config.documentdbUri,
  hq: config.hqReplicaUri,
  warehouse: config.warehouseReplicaUri,
};

const LABEL_MAP: Record<DbTargetKey, string> = {
  azure: "Global Database",
  hq: "Seattle Store",
  warehouse: "Chicago Store",
};

let client: MongoClient | null = null;
let db: Db | null = null;
let activeTarget: DbTargetKey = "azure";

export async function connectDb(target?: DbTargetKey): Promise<void> {
  const key = target ?? activeTarget;
  const uri = URI_MAP[key];
  if (client) {
    await client.close().catch(() => {});
    client = null;
    db = null;
  }
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(config.dbName);
  activeTarget = key;
  console.log(`✅ Connected to ${LABEL_MAP[key]}`);
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return client;
}

export function getActiveTarget(): { key: DbTargetKey; label: string; uri: string } {
  return { key: activeTarget, label: LABEL_MAP[activeTarget], uri: URI_MAP[activeTarget] };
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
