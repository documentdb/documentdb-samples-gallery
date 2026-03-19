import 'dotenv/config';
import { createInterface } from 'readline';
import { Ollama, OllamaEmbedding } from 'llamaindex';

import { createClients } from './utils/clients.js';
import { DocumentDBVectorStore } from './vector-store.js';
import {
  SYNTHESIZER_SYSTEM_PROMPT,
  createSynthesizerPrompt,
  formatHotelForSynthesizer,
} from './utils/prompts.js';

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'Quintessential lodging near running trails, eateries, and retail',
  'Luxury spa resort with pool and fine dining',
  'Budget-friendly downtown hotel with good wifi',
  'Pet-friendly hotel near the beach',
  'Boutique hotel with rooftop bar and city views',
];

function promptForQuery(): Promise<string> {
  return new Promise((resolve) => {
    console.log('\nExample queries:');
    SUGGESTIONS.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log();

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter your query (or press Enter to use suggestion 1): ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      const num = parseInt(trimmed, 10);
      if (!trimmed) resolve(SUGGESTIONS[0]);
      else if (num >= 1 && num <= SUGGESTIONS.length) resolve(SUGGESTIONS[num - 1]);
      else resolve(trimmed);
    });
  });
}

// ---------------------------------------------------------------------------
// Planner — embed query and retrieve top-k hotels from DocumentDB
// ---------------------------------------------------------------------------

/**
 * Embeds the user query and runs a vector similarity search against DocumentDB.
 * Returns the top-k hotel results formatted for the synthesizer.
 */
async function runPlanner(
  embedModel: OllamaEmbedding,
  vectorStore: DocumentDBVectorStore,
  userQuery: string,
  nearestNeighbors: number,
): Promise<string> {
  console.log('\n--- PLANNER ---');

  const queryVector = await embedModel.getTextEmbedding(userQuery);
  const results = await vectorStore.similaritySearch(queryVector, nearestNeighbors);

  console.log(`Found ${results.length} hotels from vector store`);
  results.forEach(({ hotel, score }) =>
    console.log(`  Hotel: ${hotel.HotelName}, Score: ${score.toFixed(4)}`),
  );

  return results
    .map(({ hotel, score }) => formatHotelForSynthesizer(hotel, score))
    .join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Synthesizer — compare hotels and write a recommendation
// ---------------------------------------------------------------------------

/**
 * Calls the LLM directly with the planner's results to produce a concise
 * plain-text hotel recommendation.
 */
async function runSynthesizer(
  synthLlm: Ollama,
  userQuery: string,
  hotelContext: string,
): Promise<string> {
  console.log('\n--- SYNTHESIZER ---');
  console.log(`Context size: ${hotelContext.length} characters`);

  const response = await synthLlm.chat({
    messages: [
      { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
      { role: 'user', content: createSynthesizerPrompt(userQuery, hotelContext) },
    ],
  });

  const answer = response.message.content as string;
  console.log(`Output: ${answer.length} characters`);
  return answer;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { embedModel, synthLlm, dbConfig } = createClients();

  const vectorStore = new DocumentDBVectorStore(
    dbConfig.client,
    dbConfig.databaseName,
    dbConfig.collectionName,
  );

  try {
    const hasData = await vectorStore.hasDocuments();
    if (!hasData) {
      console.error(
        '\nNo hotel documents found in DocumentDB.\n' +
          'Run "npm run upload" to seed the database first.',
      );
      process.exit(1);
    }

    console.log(
      `Connected to vector store: ${dbConfig.databaseName}.${dbConfig.collectionName}`,
    );

    const query = await promptForQuery();
    const nearestNeighbors = parseInt(process.env.NEAREST_NEIGHBORS ?? '5', 10);

    console.log(`\nQuery: "${query}"`);
    console.log(`Nearest neighbors: ${nearestNeighbors}`);

    const hotelContext = await runPlanner(embedModel, vectorStore, query, nearestNeighbors);

    if (!hotelContext) {
      console.error('No hotels found. Make sure the database is seeded with "npm run upload".');
      process.exit(1);
    }

    const finalAnswer = await runSynthesizer(synthLlm, query, hotelContext);

    console.log('\n--- FINAL ANSWER ---');
    console.log(finalAnswer);
  } finally {
    await dbConfig.client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
