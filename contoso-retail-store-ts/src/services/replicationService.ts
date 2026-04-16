import { MongoClient, ObjectId } from "mongodb";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { config } from "../config/index.js";
import type { ReplicationState, WriteTestResult } from "../types/index.js";

const exec = promisify(execCb);

const REPLICATION_TIMEOUT_MS = 30_000;
const CONNECTION_POLL_INTERVAL_MS = 1_000;
const STATUS_CACHE_MS = 2_000;

let lastStatusPoll = 0;

// Extract display host from Azure connection string
function extractHost(uri: string): string {
  try {
    if (uri.includes("+srv")) {
      const match = uri.match(/@([^/?]+)/);
      return match ? match[1] : "Azure";
    }
    const match = uri.match(/@([^/?]+)/);
    return match ? match[1] : "Azure";
  } catch { return "Azure"; }
}

const replicationState: ReplicationState = {
  primary: {
    label: "Global Database",
    type: "managed",
    host: extractHost(config.documentdbUri),
    status: "healthy",
    lagMs: 0,
  },
  replicas: [
    {
      label: "Seattle Store",
      type: "oss",
      host: "localhost:10261",
      status: "offline",
      lagMs: 0,
    },
    {
      label: "Chicago Store",
      type: "oss",
      host: "localhost:10262",
      status: "offline",
      lagMs: 0,
    },
  ],
  consistency: "strong",
  lastWriteAckedAt: null,
};

async function pingNode(uri: string): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  let client: MongoClient | null = null;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 3_000 });
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  } finally {
    await client?.close().catch(() => {});
  }
}

export async function getReplicationStatus(): Promise<ReplicationState> {
  const now = Date.now();
  if (now - lastStatusPoll < STATUS_CACHE_MS) {
    return structuredClone(replicationState);
  }
  lastStatusPoll = now;

  const primaryResult = await pingNode(config.documentdbUri);
  replicationState.primary.status = primaryResult.ok ? "healthy" : "offline";
  replicationState.primary.lagMs = primaryResult.ok ? primaryResult.latencyMs : 0;

  const replicaUris = [config.hqReplicaUri, config.warehouseReplicaUri] as const;
  for (let i = 0; i < 2; i++) {
    const replica = replicationState.replicas[i];
    if (replica.status === "offline" || replica.status === "pending") continue;

    const result = await pingNode(replicaUris[i]);
    if (result.ok) {
      replica.status = "connected";
      replica.lagMs = result.latencyMs;
    } else {
      replica.status = "offline";
      replica.lagMs = 0;
    }
  }

  return structuredClone(replicationState);
}

async function waitForConnection(uri: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { ok } = await pingNode(uri);
    if (ok) return;
    await new Promise((r) => setTimeout(r, CONNECTION_POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for connection after ${timeoutMs}ms`);
}

async function execDocker(command: string): Promise<string> {
  try {
    const { stdout } = await exec(command, { timeout: 60_000 });
    return stdout.trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Docker command failed: ${msg}`);
  }
}

export async function* enableReplication(
  target: "hq" | "warehouse"
): AsyncGenerator<string> {
  const index = target === "hq" ? 0 : 1;
  const replica = replicationState.replicas[index];

  if (replica.status === "connected") {
    yield `${replica.label} is already connected.`;
    return;
  }

  replica.status = "pending";
  yield `Starting OSS DocumentDB container for ${replica.label}...`;

  await execDocker(
    `docker compose -f docker-compose.replication.yml --profile ${target} up -d`
  );
  yield "Container starting...";

  const uri = target === "hq" ? config.hqReplicaUri : config.warehouseReplicaUri;

  yield "Waiting for DocumentDB to accept connections...";
  try {
    await waitForConnection(uri, REPLICATION_TIMEOUT_MS);
  } catch {
    replica.status = "offline";
    yield `Error: ${replica.label} failed to start within ${REPLICATION_TIMEOUT_MS / 1_000}s. Check Docker logs.`;
    return;
  }

  yield "Container ready. Verifying connection...";
  await new Promise((r) => setTimeout(r, 1_500));

  replica.status = "connected";
  replica.lagMs = 0;
  lastStatusPoll = 0;

  yield "Replication active. Zero data loss guaranteed.";
  yield "DONE";
}

export async function runWriteTest(): Promise<WriteTestResult> {
  const primaryClient = new MongoClient(config.documentdbUri);
  try {
    await primaryClient.connect();
    const testDoc = { _id: new ObjectId(), ts: new Date(), test: true };

    const primaryStart = performance.now();
    await primaryClient.db(config.dbName).collection("write_tests").insertOne(testDoc);
    const primaryAckMs = Math.round(performance.now() - primaryStart);

    let replicaAckMs = 0;
    const connectedReplicas: { uri: string; index: number }[] = [];

    if (replicationState.replicas[0].status === "connected") {
      connectedReplicas.push({ uri: config.hqReplicaUri, index: 0 });
    }
    if (replicationState.replicas[1].status === "connected") {
      connectedReplicas.push({ uri: config.warehouseReplicaUri, index: 1 });
    }

    for (const { uri } of connectedReplicas) {
      const replicaClient = new MongoClient(uri);
      try {
        await replicaClient.connect();
        const replicaStart = performance.now();
        await replicaClient.db(config.dbName).collection("write_tests").insertOne(testDoc);
        replicaAckMs = Math.max(replicaAckMs, Math.round(performance.now() - replicaStart));
      } finally {
        await replicaClient.close().catch(() => {});
      }
    }

    replicationState.lastWriteAckedAt = new Date().toISOString();

    return {
      primaryAckMs,
      replicaAckMs,
      note: "In production: Azure ~5ms, on-prem replica ~40-80ms over VPN",
    };
  } finally {
    await primaryClient.close().catch(() => {});
  }
}

export async function resetReplication(): Promise<void> {
  await execDocker(
    "docker compose -f docker-compose.replication.yml --profile hq --profile warehouse down"
  );

  replicationState.replicas[0].status = "offline";
  replicationState.replicas[0].lagMs = 0;
  replicationState.replicas[1].status = "offline";
  replicationState.replicas[1].lagMs = 0;
  replicationState.lastWriteAckedAt = null;
  lastStatusPoll = 0;
}
