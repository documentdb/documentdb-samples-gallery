import { Router } from "express";
import * as inventoryService from "../services/inventoryService.js";
import { getActiveTarget } from "../db/client.js";
import { trackLocalChange } from "../services/changeStreamSync.js";
import { pushLog } from "../server.js";

const WAREHOUSE_FILTER: Record<string, string | null> = {
  azure: null,            // Global Database → show all warehouses
  hq: "WH-SEATTLE",      // Seattle Store → only Seattle
  warehouse: "WH-CHICAGO" // Chicago Store → only Chicago
};

const router = Router();

router.get("/:sku", async (req, res, next) => {
  try {
    const { key } = getActiveTarget();
    const warehouseId = WAREHOUSE_FILTER[key] ?? null;
    const records = await inventoryService.getInventoryBySku(req.params["sku"]!, warehouseId);
    if (records.length === 0) {
      res.status(404).json({ error: "No inventory found for this SKU" });
      return;
    }
    res.json(records);
  } catch (err) {
    next(err);
  }
});

router.patch("/:sku/adjust", async (req, res, next) => {
  try {
    const { warehouseId, delta } = req.body as { warehouseId: string; delta: number };
    if (!warehouseId || typeof delta !== "number") {
      res.status(400).json({ error: "warehouseId (string) and delta (number) are required" });
      return;
    }
    const updated = await inventoryService.adjustQuantity(req.params["sku"]!, warehouseId, delta);
    if (!updated) {
      res.status(404).json({ error: "Inventory record not found" });
      return;
    }
    pushLog(`📦 Inventory ${delta > 0 ? '+' : ''}${delta} for ${req.params["sku"]} @ ${warehouseId} → qty: ${updated.quantityOnHand}`);
    const { label } = getActiveTarget();
    trackLocalChange("inventory", label, { sku: req.params["sku"], warehouseId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
