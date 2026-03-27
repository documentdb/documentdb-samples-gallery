import express from "express";
import { createMcpServer } from "./server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { connectDb, disconnectDb } from "./db.js";
import { logger } from "./logger.js";
import crypto from "crypto";

const PORT = parseInt(process.env.MCP_SERVER_PORT || "3000", 10);
const NO_AUTH = process.env.NO_AUTH === "true";
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// Fail-safe: if no auth token and not explicitly disabled, auto-generate one
if (!AUTH_TOKEN && !NO_AUTH) {
  AUTH_TOKEN = crypto.randomBytes(24).toString("base64url");
  logger.warn("════════════════════════════════════════════════════════════════");
  logger.warn(`  No AUTH_TOKEN set — auto-generated: ${AUTH_TOKEN}`);
  logger.warn("  Set AUTH_TOKEN in .env for a fixed token.");
  logger.warn("  Set NO_AUTH=true to disable auth (dev only).");
  logger.warn("════════════════════════════════════════════════════════════════");
}

// Simple in-memory rate limiter: max requests per IP per window
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "60", 10);
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

async function main() {
  // Connect to DocumentDB
  await connectDb();

  const app = express();

  const MCP_PATHS = ["/mcp", "/v1/mcp"];

  // Version header on all responses
  app.use((_req, res, next) => {
    res.set("X-API-Version", "v1");
    next();
  });

  // Rate limiting (applied to all MCP paths)
  for (const path of MCP_PATHS) {
    app.use(path, (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (rateLimit(ip)) {
        logger.warn({ ip }, "Rate limited");
        res.status(429).json({ error: "Too many requests" });
        return;
      }
      const entry = rateLimitMap.get(ip);
      if (entry) {
        res.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
        res.set("X-RateLimit-Remaining", String(Math.max(0, RATE_LIMIT_MAX - entry.count)));
        res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      }
      next();
    });
  }

  // Auth middleware (applied to all MCP paths)
  if (!NO_AUTH && AUTH_TOKEN) {
    for (const path of MCP_PATHS) {
      app.use(path, (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        logger.warn({ ip }, "Auth rejected");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
    }
  }

  // Health check — includes DB connectivity
  app.get("/health", async (_req, res) => {
    try {
      const { getMemoriesCollection } = await import("./db.js");
      const col = getMemoriesCollection();
      await col.countDocuments({}, { maxTimeMS: 3000 });
      res.json({ status: "ok", service: "personal-memory-mcp", db: "connected" });
    } catch {
      res.status(503).json({ status: "degraded", service: "personal-memory-mcp", db: "disconnected" });
    }
  });

  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      const { getMemoriesCollection } = await import("./db.js");
      const col = getMemoriesCollection();
      await col.countDocuments({}, { maxTimeMS: 3000 });
      res.json({ status: "ready", db: "connected" });
    } catch {
      res.status(503).json({ status: "not_ready", db: "disconnected" });
    }
  });

  // Request logging
  for (const path of MCP_PATHS) {
    app.use(path, (req, _res, next) => {
      const body = req.body;
      if (body?.method && body.method !== "initialize") {
        const toolName = body?.params?.name || body?.method;
        logger.debug({ method: req.method, tool: toolName }, "MCP request");
      }
      next();
    });
  }

  // MCP Streamable HTTP transport handler
  const handleMcpPost = async (req: express.Request, res: express.Response) => {
    try {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error({ err }, "MCP transport error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };

  const handleMcpGet = async (req: express.Request, res: express.Response) => {
    try {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.error({ err }, "MCP transport error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };

  const handleMcpDelete = async (_req: express.Request, res: express.Response) => {
    res.status(200).json({ ok: true });
  };

  // Register MCP handlers on both /mcp and /v1/mcp
  for (const path of MCP_PATHS) {
    app.post(path, handleMcpPost);
    app.get(path, handleMcpGet);
    app.delete(path, handleMcpDelete);
  }

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "MCP server started");
    logger.info({ auth: NO_AUTH ? "disabled" : "bearer" }, "Auth mode");
    logger.info({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS }, "Rate limit configured");
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("Shutting down");
    await disconnectDb();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await disconnectDb();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
