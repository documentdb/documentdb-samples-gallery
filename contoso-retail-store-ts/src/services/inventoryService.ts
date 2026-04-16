import { getDb } from "../db/client.js";
import type { InventoryRecord } from "../types/index.js";

const COLLECTION = "inventory";

type WarehouseId = InventoryRecord["warehouseId"];

export async function getInventoryBySku(sku: string, warehouseId?: string | null): Promise<InventoryRecord[]> {
  const col = getDb().collection<InventoryRecord>(COLLECTION);
  const filter: Record<string, string> = { sku };
  if (warehouseId) filter.warehouseId = warehouseId;
  return col.find(filter).toArray();
}

export async function adjustQuantity(
  sku: string,
  warehouseId: string,
  delta: number
): Promise<InventoryRecord | null> {
  const col = getDb().collection<InventoryRecord>(COLLECTION);
  const result = await col.findOneAndUpdate(
    { sku, warehouseId: warehouseId as WarehouseId },
    { $inc: { quantityOnHand: delta }, $set: { lastUpdated: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}
