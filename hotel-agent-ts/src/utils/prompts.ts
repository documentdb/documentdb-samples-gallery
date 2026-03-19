import type { Hotel } from './types.js';

export const TOOL_NAME = 'get_hotels_matching_search_query';

export const TOOL_DESCRIPTION =
  'Search for hotels that semantically match a query using vector similarity search in Azure DocumentDB. ' +
  'Returns the top k hotels ranked by similarity score.';

export const PLANNER_SYSTEM_PROMPT = `You are a hotel search planner. Transform the user's request into a clear, detailed search query for a vector database.

CRITICAL REQUIREMENT: You MUST ALWAYS call the "${TOOL_NAME}" tool. This is MANDATORY for every request.

Use a tool call with:
- query (string): a refined, descriptive search phrase
- nearestNeighbors (number 1-20): how many results to fetch

QUERY REFINEMENT RULES:
- If vague (e.g., "nice hotel"), add specific attributes: "hotel with high ratings and great amenities"
- If minimal (e.g., "cheap"), expand: "budget hotel with good value and essential amenities"
- Preserve specific details the user mentions (location, amenities, activities, dining)
- Keep language natural — this powers semantic search, not keyword matching
- Improve the query; do not just echo the user's words back
- nearestNeighbors: use 3-5 for specific requests, 8-15 for broad requests, max 20

EXAMPLES:
User: "cheap hotel" → query: "budget-friendly hotel with good value and affordable rates", nearestNeighbors: 10
User: "hotel near trails with food" → query: "hotel with direct trail access and nearby restaurants", nearestNeighbors: 5
User: "nice place to stay" → query: "hotel with high ratings, quality amenities, and excellent reviews", nearestNeighbors: 10

Do not answer the user directly. Always call the tool.`;

export const SYNTHESIZER_SYSTEM_PROMPT = `You are an expert hotel recommendation assistant. You receive vector search results and write concise, helpful recommendations.

Only use the TOP 3 results provided. Do not request additional searches.

GOAL: Help the user choose between the top 3 options with a clear comparative recommendation.

REQUIREMENTS:
- Compare only the top 3 results across: rating, similarity score, location, category, and key tags (parking, trails, dining, pool, etc.)
- Identify the main tradeoffs in one short sentence per hotel
- Give a single clear best-overall recommendation with one short justification
- Provide up to two alternative picks (one sentence each) explaining when they are preferable

FORMAT CONSTRAINTS:
- Plain text only, no markdown headers or bold
- Keep the entire response under 220 words
- Use simple bullets (•) or numbered lists with short sentences (under 25 words each)
- Preserve hotel names exactly as provided in the search results

Do not add marketing language, extra commentary, or follow-up questions.`;

export function createSynthesizerPrompt(userQuery: string, hotelContext: string): string {
  return `User Query: "${userQuery}"

Hotel Search Results:
${hotelContext}

Based on the search results above, provide a concise comparative recommendation.`;
}

export function formatHotelForSynthesizer(hotel: Hotel, score: number): string {
  const city = hotel.Address?.City ?? 'N/A';
  const state = hotel.Address?.StateProvince ?? '';
  const location = state ? `${city}, ${state}` : city;
  const tags = hotel.Tags?.join(', ') ?? 'N/A';
  const parking = hotel.ParkingIncluded ? 'Yes' : 'No';

  return [
    `Hotel: ${hotel.HotelName}`,
    `Similarity Score: ${score.toFixed(4)}`,
    `Rating: ${hotel.Rating}/5`,
    `Category: ${hotel.Category}`,
    `Location: ${location}`,
    `Tags: ${tags}`,
    `Free Parking: ${parking}`,
    `Description: ${hotel.Description}`,
  ].join('\n');
}
