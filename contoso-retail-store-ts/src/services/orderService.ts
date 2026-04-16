import { ObjectId } from "mongodb";
import { getDb } from "../db/client.js";
import type { Order, OrderItem, OrderStatus, ShippingAddress } from "../types/index.js";

const COLLECTION = "orders";
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

interface CreateOrderInput {
  customerId: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
}

export async function listOrders(limit = 20): Promise<Order[]> {
  return getDb()
    .collection<Order>(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const db = getDb();
  const productCol = db.collection("products");

  const skus = input.items.map((i) => i.sku);
  const existing = await productCol.find({ sku: { $in: skus } }).toArray();
  const existingSkus = new Set(existing.map((p) => p["sku"] as string));

  const missing = skus.filter((s) => !existingSkus.has(s));
  if (missing.length > 0) {
    throw new Error(`Unknown SKUs: ${missing.join(", ")}`);
  }

  const totalAmount = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const now = new Date();

  const order: Order = {
    _id: new ObjectId(),
    customerId: input.customerId,
    items: input.items,
    status: "pending",
    totalAmount: Math.round(totalAmount * 100) / 100,
    shippingAddress: input.shippingAddress,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<Order>(COLLECTION).insertOne(order);
  return order;
}

export async function getOrder(id: string): Promise<Order | null> {
  return getDb()
    .collection<Order>(COLLECTION)
    .findOne({ _id: new ObjectId(id) });
}

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus
): Promise<Order | null> {
  const col = getDb().collection<Order>(COLLECTION);
  const order = await col.findOne({ _id: new ObjectId(id) });

  if (!order) return null;

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${order.status}" to "${newStatus}". Allowed: ${allowed.join(", ") || "none"}`
    );
  }

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status: newStatus, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}
