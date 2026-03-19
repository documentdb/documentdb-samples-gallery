import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import { MongoClient } from 'mongodb';

export interface DbConfig {
  client: MongoClient;
  databaseName: string;
  collectionName: string;
}

export interface Clients {
  embedModel: OllamaEmbedding;
  plannerLlm: Ollama;
  synthLlm: Ollama;
  dbConfig: DbConfig;
}

/**
 * Create all clients from environment variables.
 *
 * LLM + embeddings: Ollama (local, open-source)
 * Database: DocumentDB OSS via MongoDB-compatible gateway
 */
export function createClients(): Clients {
  const host = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  const embedModel = new OllamaEmbedding({
    model: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
    config: { host },
  });

  const plannerLlm = new Ollama({
    model: process.env.OLLAMA_PLANNER_MODEL ?? 'llama3.2',
    config: { host },
    options: { temperature: 0 },
  });

  const synthLlm = new Ollama({
    model: process.env.OLLAMA_SYNTH_MODEL ?? 'llama3.2',
    config: { host },
    options: { temperature: 0.3 },
  });

  const connectionString =
    process.env.DOCUMENTDB_CONNECTION_STRING ?? 'mongodb://localhost:10260';

  return {
    embedModel,
    plannerLlm,
    synthLlm,
    dbConfig: {
      client: new MongoClient(connectionString),
      databaseName: process.env.DOCUMENTDB_DATABASE ?? 'Hotels',
      collectionName: process.env.DOCUMENTDB_COLLECTION ?? 'hotel_data',
    },
  };
}
