import type { Hotel } from './types.js';

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
