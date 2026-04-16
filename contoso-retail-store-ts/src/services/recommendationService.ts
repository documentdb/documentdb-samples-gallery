import { getRecommendations } from "./productService.js";
import type { RecommendationResult } from "../types/index.js";

const MAX_RECOMMENDATIONS = 10;

export async function getProductRecommendations(
  productId: string,
  limit: number = MAX_RECOMMENDATIONS
): Promise<RecommendationResult[]> {
  return getRecommendations(productId, limit);
}
