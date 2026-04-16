import { Router } from "express";
import { getProductRecommendations } from "../services/recommendationService.js";
import { pushLog } from "../server.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const productId = req.query["productId"] as string;
    if (!productId) {
      res.status(400).json({ error: "productId query parameter is required" });
      return;
    }
    const limit = Math.min(parseInt(req.query["limit"] as string) || 10, 20);
    const results = await getProductRecommendations(productId, limit);
    pushLog(`🤖 Vector search: ${results.length} recommendations for product ${productId.slice(-6)}`);
    res.json({ productId, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      res.status(404).json({ error: msg });
      return;
    }
    next(err);
  }
});

export default router;
