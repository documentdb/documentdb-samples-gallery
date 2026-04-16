import { Router, type Request, type Response } from "express";
import * as replicationService from "../services/replicationService.js";
import { pushLog } from "../server.js";

const router = Router();

const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

router.get("/status", async (_req, res, next) => {
  try {
    const status = await replicationService.getReplicationStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post("/enable", async (req: Request, res: Response) => {
  const { target } = req.body as { target: "hq" | "warehouse" };
  if (target !== "hq" && target !== "warehouse") {
    res.status(400).json({ error: 'target must be "hq" or "warehouse"' });
    return;
  }
  pushLog(`🔗 Enabling replication for ${target}...`);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, SSE_KEEPALIVE_INTERVAL_MS);

  try {
    for await (const message of replicationService.enableReplication(target)) {
      res.write(`data: ${message}\n\n`);
      if (message === "DONE") break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected error during replication setup";
    res.write(`data: Error: ${msg}\n\n`);
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});

router.post("/write-test", async (_req, res, next) => {
  try {
    const result = await replicationService.runWriteTest();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/reset", async (_req, res, next) => {
  try {
    await replicationService.resetReplication();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
