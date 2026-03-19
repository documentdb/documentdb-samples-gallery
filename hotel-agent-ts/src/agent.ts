import 'dotenv/config';
import { ReActAgent, FunctionTool } from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';

import { createClients } from './utils/clients.js';
import { DocumentDBVectorStore } from './vector-store.js';
import {
  PLANNER_SYSTEM_PROMPT,
  SYNTHESIZER_SYSTEM_PROMPT,
  TOOL_NAME,
  TOOL_DESCRIPTION,
  createSynthesizerPrompt,
  formatHotelForSynthesizer,
} from './utils/prompts.js';

// ---------------------------------------------------------------------------
// Planner agent
// ---------------------------------------------------------------------------

/**
 * Runs the planner agent.
 *
 * Uses ReActAgent so it works with any Ollama model regardless of whether the
 * model supports OpenAI-style function calling. The agent refines the user
 * query and calls the hotel search tool. We capture the raw tool output via
 * a closure variable so the synthesizer gets structured data.
 */
async function runPlannerAgent(
  plannerLlm: Ollama,
  embedModel: OllamaEmbedding,
  vectorStore: DocumentDBVectorStore,
  userQuery: string,
  nearestNeighbors: number,
): Promise<string> {
  console.log('\n--- PLANNER ---');

  let capturedHotelData = '';

  const hotelSearchTool = FunctionTool.from<{
    query: string;
    nearestNeighbors?: number;
  }>(
    async ({ query, nearestNeighbors: k }) => {
      const queryVector = await embedModel.getQueryEmbedding(query);
      const results = await vectorStore.similaritySearch(queryVector, k ?? nearestNeighbors);

      console.log(`Found ${results.length} hotels from vector store`);
      results.forEach(({ hotel, score }) =>
        console.log(`  Hotel: ${hotel.HotelName}, Score: ${score.toFixed(4)}`),
      );

      capturedHotelData = results
        .map(({ hotel, score }) => formatHotelForSynthesizer(hotel, score))
        .join('\n\n---\n\n');

      return capturedHotelData;
    },
    {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Refined semantic search query for finding hotels',
          },
          nearestNeighbors: {
            type: 'number',
            description: 'Number of hotels to return (1-20)',
          },
        },
        required: ['query'],
      },
    },
  );

  // ReActAgent works with any LLM via text-based ReAct prompting.
  // The system prompt is injected as the first message in chatHistory.
  const agent = new ReActAgent({
    tools: [hotelSearchTool],
    llm: plannerLlm,
    verbose: false,
    chatHistory: [{ role: 'system', content: PLANNER_SYSTEM_PROMPT }],
  });

  const userMessage =
    `Use the "${TOOL_NAME}" tool with nearestNeighbors=${nearestNeighbors} ` +
    `and query="${userQuery}". Do not answer directly; call the tool.`;

  await agent.chat({ message: userMessage });

  return capturedHotelData;
}

// ---------------------------------------------------------------------------
// Synthesizer agent
// ---------------------------------------------------------------------------

/**
 * Runs the synthesizer.
 *
 * No tools needed — calls the LLM directly with the system prompt and the
 * planner's hotel results to produce a concise plain-text recommendation.
 */
async function runSynthesizerAgent(
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
  const { embedModel, plannerLlm, synthLlm, dbConfig } = createClients();

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

    const query =
      process.env.QUERY ?? 'quintessential lodging near running trails, eateries, and retail';
    const nearestNeighbors = parseInt(process.env.NEAREST_NEIGHBORS ?? '5', 10);

    console.log(`\nQuery: "${query}"`);
    console.log(`Nearest neighbors: ${nearestNeighbors}`);

    const hotelContext = await runPlannerAgent(
      plannerLlm,
      embedModel,
      vectorStore,
      query,
      nearestNeighbors,
    );

    if (!hotelContext) {
      console.error('Planner did not invoke the search tool. Try a model with better instruction following.');
      process.exit(1);
    }

    const finalAnswer = await runSynthesizerAgent(synthLlm, query, hotelContext);

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
