import { ObjectId } from "mongodb";
import { getDb } from "../db/client.js";
import { config } from "../config/index.js";
import { generateEmbedding } from "./embeddingService.js";
import type { Product, ProductSearchResult, RecommendationResult } from "../types/index.js";

const MAX_RECOMMENDATIONS = 10;
const COLLECTION = "products";

export async function listProducts(
  limit: number,
  offset: number,
  category?: string
): Promise<{ products: Omit<Product, "embedding">[]; total: number }> {
  const col = getDb().collection<Product>(COLLECTION);
  const filter: Record<string, unknown> = {};
  if (category) filter["category"] = category;

  const [products, total] = await Promise.all([
    col
      .find(filter, { projection: { embedding: 0 } })
      .skip(offset)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  return { products, total };
}

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const col = getDb().collection<Product>(COLLECTION);
  const results = await col
    .find(
      { $text: { $search: query } },
      {
        projection: { embedding: 0, score: { $meta: "textScore" } },
        sort: { score: { $meta: "textScore" } },
      }
    )
    .limit(20)
    .toArray();

  return results as unknown as ProductSearchResult[];
}

export async function getProduct(idOrSku: string): Promise<Omit<Product, "embedding"> | null> {
  const col = getDb().collection<Product>(COLLECTION);
  let filter: Record<string, unknown>;

  if (ObjectId.isValid(idOrSku) && idOrSku.length === 24) {
    filter = { _id: new ObjectId(idOrSku) };
  } else {
    filter = { sku: idOrSku };
  }

  return col.findOne(filter, { projection: { embedding: 0 } });
}

export async function getRecommendations(
  productId: string,
  limit: number = MAX_RECOMMENDATIONS
): Promise<RecommendationResult[]> {
  const col = getDb().collection<Product>(COLLECTION);

  const source = await col.findOne(
    { _id: new ObjectId(productId) },
    { projection: { embedding: 1 } }
  );
  if (!source?.embedding) {
    throw new Error(`Product ${productId} not found or has no embedding`);
  }

  const pipeline = [
    {
      $search: {
        cosmosSearch: {
          vector: source.embedding,
          path: "embedding",
          k: limit + 1,
        },
        returnStoredSource: true,
      },
    },
    { $addFields: { similarityScore: { $meta: "searchScore" } } },
    { $project: { embedding: 0 } },
    { $match: { _id: { $ne: new ObjectId(productId) } } },
    { $limit: limit },
  ];

  return col.aggregate<RecommendationResult>(pipeline).toArray();
}

export async function ensureIndexes(): Promise<void> {
  const col = getDb().collection<Product>(COLLECTION);

  await col.createIndex(
    { name: "text", description: "text", tags: "text" },
    { name: "text_search" }
  );

  try {
    await getDb().command({
      createIndexes: COLLECTION,
      indexes: [
        {
          name: "vector_index",
          key: { embedding: "cosmosSearch" },
          cosmosSearchOptions: {
            kind: "vector-hnsw",
            m: 16,
            efConstruction: 64,
            similarity: "COS",
            dimensions: config.embeddingDimensions,
          },
        },
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      console.log("ℹ️  Vector index already exists");
    } else {
      throw err;
    }
  }

  console.log("✅ Product indexes ensured");
}
