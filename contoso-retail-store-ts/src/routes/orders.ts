import { Router } from "express";
import * as orderService from "../services/orderService.js";
import type { OrderStatus } from "../types/index.js";
import { getActiveTarget } from "../db/client.js";
import { trackLocalChange } from "../services/changeStreamSync.js";
import { pushLog } from "../server.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query["limit"] as string) || 20, 100);
    const orders = await orderService.listOrders(limit);
    pushLog(`📋 GET /orders — ${orders.length} recent orders`);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { customerId, items, shippingAddress } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0 || !shippingAddress) {
      res
        .status(400)
        .json({ error: "customerId, items (non-empty array), and shippingAddress are required" });
      return;
    }
    const order = await orderService.createOrder({ customerId, items, shippingAddress });
    pushLog(`🛒 Order created: ${order._id} — ${items.length} item(s) for ${customerId}`);
    const { label } = getActiveTarget();
    trackLocalChange("orders", label);
    res.status(201).json(order);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Unknown SKUs")) {
      res.status(400).json({ error: msg });
      return;
    }
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params["id"]!);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body as { status: OrderStatus };
    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    const order = await orderService.updateOrderStatus(req.params["id"]!, status);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Cannot transition")) {
      res.status(400).json({ error: msg });
      return;
    }
    next(err);
  }
});

export default router;
