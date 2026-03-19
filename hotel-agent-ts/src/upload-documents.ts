/**
 * upload-documents.ts
 *
 * Seeds DocumentDB (OSS) with hotel data:
 *   1. Reads hotels from the JSON data file
 *   2. Generates a vector embedding for each hotel's Description field via Ollama
 *   3. Inserts all documents (with embeddings) into the collection
 *   4. Creates a vector index so similarity search works
 *
 * Run once before starting the agent: npm run upload
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createClients } from './utils/clients.js';
import { DocumentDBVectorStore } from './vector-store.js';
import type { Hotel, HotelDocument } from './utils/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log('Starting document upload...\n');

  const { embedModel, dbConfig } = createClients();

  const dataFilePath = process.env.DATA_FILE ?? join(__dirname, '..', 'data', 'hotels.json');
  const algorithm = (process.env.VECTOR_INDEX_ALGORITHM ?? 'vector-ivf') as
    | 'vector-ivf'
    | 'vector-hnsw'
    | 'vector-diskann';
  const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '768', 10);

  console.log(`Data file   : ${dataFilePath}`);
  console.log(`Database    : ${dbConfig.databaseName}`);
  console.log(`Collection  : ${dbConfig.collectionName}`);
  console.log(`Algorithm   : ${algorithm}`);
  console.log(`Dimensions  : ${dimensions}\n`);

  // 1. Load hotel data
  const hotels: Hotel[] = JSON.parse(readFileSync(dataFilePath, 'utf-8')) as Hotel[];
  console.log(`Loaded ${hotels.length} hotels`);

  // 2. Generate embeddings sequentially to avoid overwhelming Ollama
  console.log('\nGenerating embeddings via Ollama (this may take a minute)...');
  const startTime = Date.now();
  const hotelDocuments: HotelDocument[] = [];

  for (let i = 0; i < hotels.length; i++) {
    const hotel = hotels[i];
    const embedding = await embedModel.getQueryEmbedding(hotel.Description);
    process.stdout.write(`  [${i + 1}/${hotels.length}] ${hotel.HotelName}\n`);
    hotelDocuments.push({ ...hotel, embedding });
  }

  console.log(`\nEmbeddings generated in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // 3. Insert documents and create vector index
  const vectorStore = new DocumentDBVectorStore(
    dbConfig.client,
    dbConfig.databaseName,
    dbConfig.collectionName,
  );

  await vectorStore.addDocuments(hotelDocuments);
  await vectorStore.ensureVectorIndex(dimensions, algorithm);

  console.log(`\nUpload completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('Run "npm start" to launch the hotel recommendation agent.');

  await dbConfig.client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nUpload failed:', err);
  process.exit(1);
});
