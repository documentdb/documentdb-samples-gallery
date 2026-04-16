import { ObjectId } from "mongodb";

export interface Product {
  _id: ObjectId;
  sku: string;
  name: string;
  category: "Electronics" | "Apparel" | "Home" | "Sports";
  description: string;
  price: number;
  tags: string[];
  embedding: number[];
  createdAt: Date;
}

export interface InventoryRecord {
  _id: ObjectId;
  sku: string;
  warehouseId: "WH-SEATTLE" | "WH-AUSTIN" | "WH-CHICAGO";
  quantityOnHand: number;
  reorderThreshold: number;
  lastUpdated: Date;
}

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface ShippingAddress {
  city: string;
  state: string;
  zip: string;
}

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

export interface Order {
  _id: ObjectId;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  shippingAddress: ShippingAddress;
  createdAt: Date;
  updatedAt: Date;
}

export type ReplicationNodeType = "managed" | "oss";
export type ReplicationNodeStatus = "healthy" | "connected" | "pending" | "offline";

export interface ReplicationNode {
  label: string;
  type: ReplicationNodeType;
  host: string;
  status: ReplicationNodeStatus;
  lagMs: number;
}

export interface ReplicationState {
  primary: ReplicationNode;
  replicas: [ReplicationNode, ReplicationNode];
  consistency: "strong";
  lastWriteAckedAt: string | null;
}

export interface WriteTestResult {
  primaryAckMs: number;
  replicaAckMs: number;
  note: string;
}

export interface HealthResponse {
  status: "ok" | "error";
  dbTarget: "local" | "azure";
  latencyMs: number;
}

export interface ProductSearchResult extends Omit<Product, "embedding"> {
  score: number;
}

export interface RecommendationResult extends Omit<Product, "embedding"> {
  similarityScore: number;
}
