/**
 * cleanup.ts
 *
 * Drops the hotel collection from DocumentDB.
 * Run after you are done with the sample to free storage.
 *
 *   npm run cleanup
 */

import 'dotenv/config';
import { createClients } from './utils/clients.js';
import { DocumentDBVectorStore } from './vector-store.js';

async function main(): Promise<void> {
  const { dbConfig } = createClients();

  console.log(`Dropping collection: ${dbConfig.databaseName}.${dbConfig.collectionName}`);

  const vectorStore = new DocumentDBVectorStore(
    dbConfig.client,
    dbConfig.databaseName,
    dbConfig.collectionName,
  );

  await vectorStore.dropCollection();
  await dbConfig.client.close();

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
