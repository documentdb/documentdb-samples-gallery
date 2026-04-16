import { Router } from "express";
import * as productService from "../services/productService.js";
import { pushLog } from "../server.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query["limit"] as string) || 20, 100);
    const offset = Math.max(parseInt(req.query["offset"] as string) || 0, 0);
    const category = req.query["category"] as string | undefined;
    const result = await productService.listProducts(limit, offset, category);
    pushLog(`📦 GET /products — ${result.total} products${category ? ` [${category}]` : ''}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const q = req.query["q"] as string;
    if (!q || q.trim().length < 2) {
      res.status(400).json({ error: "Query parameter 'q' must be at least 2 characters" });
      return;
    }
    const results = await productService.searchProducts(q.trim());
    pushLog(`🔍 Search: "${q}" — ${results.length} results`);
    res.json({ query: q, results });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const product = await productService.getProduct(req.params["id"]!);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

export default router;
