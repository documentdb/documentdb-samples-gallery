import "dotenv/config";

interface Config {
  port: number;
  nodeEnv: string;
  documentdbUri: string;
  dbName: string;
  ollamaUrl: string;
  ollamaModel: string;
  embeddingDimensions: number;
  primaryUri: string;
  hqReplicaUri: string;
  warehouseReplicaUri: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill in all values.`
    );
  }
  return value;
}

export const config: Config = {
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  documentdbUri: requireEnv("DOCUMENTDB_URI"),
  dbName: process.env["DB_NAME"] ?? "retaildb",
  ollamaUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
  ollamaModel: process.env["OLLAMA_MODEL"] ?? "nomic-embed-text",
  embeddingDimensions: parseInt(process.env["EMBEDDING_DIMENSIONS"] ?? "768", 10),
  primaryUri: requireEnv("PRIMARY_URI"),
  hqReplicaUri: requireEnv("HQ_REPLICA_URI"),
  warehouseReplicaUri: requireEnv("WAREHOUSE_REPLICA_URI"),
};
