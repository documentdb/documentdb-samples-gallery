import { MongoClient, Collection, Db, Document } from 'mongodb';
import type { HotelDocument, Hotel, SearchResult } from './utils/types.js';

type VectorAlgorithm = 'vector-ivf' | 'vector-hnsw' | 'vector-diskann';

interface IvfOptions {
  kind: 'vector-ivf';
  numLists: number;
  similarity: string;
  dimensions: number;
}

interface HnswOptions {
  kind: 'vector-hnsw';
  m: number;
  efConstruction: number;
  similarity: string;
  dimensions: number;
}

interface DiskAnnOptions {
  kind: 'vector-diskann';
  similarity: string;
  dimensions: number;
}

type CosmosSearchOptions = IvfOptions | HnswOptions | DiskAnnOptions;

/**
 * Thin wrapper around a DocumentDB (MongoDB-compatible) collection that
 * handles vector index creation, document insertion, and similarity search.
 */
export class DocumentDBVectorStore {
  private collection: Collection<HotelDocument>;
  private db: Db;

  constructor(client: MongoClient, databaseName: string, collectionName: string) {
    this.db = client.db(databaseName);
    this.collection = this.db.collection<HotelDocument>(collectionName);
  }

  /**
   * Creates a vector index on the `embedding` field using the configured algorithm.
   * Uses db.command() because cosmosSearch is a non-standard index type not
   * represented in the MongoDB driver's type definitions.
   */
  async ensureVectorIndex(dimensions: number, algorithm: VectorAlgorithm = 'vector-ivf'): Promise<void> {
    const similarity = process.env.VECTOR_SIMILARITY ?? 'COS';

    let cosmosSearchOptions: CosmosSearchOptions;

    switch (algorithm) {
      case 'vector-hnsw':
        cosmosSearchOptions = {
          kind: 'vector-hnsw',
          m: parseInt(process.env.HNSW_M ?? '16', 10),
          efConstruction: parseInt(process.env.HNSW_EF_CONSTRUCTION ?? '64', 10),
          similarity,
          dimensions,
        };
        break;

      case 'vector-diskann':
        cosmosSearchOptions = { kind: 'vector-diskann', similarity, dimensions };
        break;

      case 'vector-ivf':
      default:
        cosmosSearchOptions = {
          kind: 'vector-ivf',
          // numLists ≈ sqrt(n) is a good starting point; 1 is fine for small datasets
          numLists: 1,
          similarity,
          dimensions,
        };
    }

    await (this.db as unknown as { command: (cmd: Document) => Promise<Document> }).command({
      createIndexes: this.collection.collectionName,
      indexes: [
        {
          key: { embedding: 'cosmosSearch' },
          name: 'idx_hotel_embedding',
          cosmosSearchOptions,
        },
      ],
    });

    console.log(`Vector index created (algorithm: ${algorithm}, dimensions: ${dimensions})`);
  }

  /**
   * Inserts hotel documents (with embeddings) into the collection.
   * Clears any existing documents first so re-runs stay idempotent.
   */
  async addDocuments(hotels: HotelDocument[]): Promise<void> {
    await this.collection.deleteMany({});
    await this.collection.insertMany(hotels);
    console.log(`Inserted ${hotels.length} hotel documents`);
  }

  /**
   * Performs a vector similarity search using DocumentDB's $search aggregation stage.
   * Returns results sorted by descending similarity score.
   */
  async similaritySearch(queryVector: number[], k: number): Promise<SearchResult[]> {
    const pipeline: Document[] = [
      {
        $search: {
          cosmosSearch: {
            vector: queryVector,
            path: 'embedding',
            k,
          },
          returnStoredSource: true,
        },
      },
      // Add score as a field first, then exclude the large embedding array.
      // DocumentDB does not allow mixing inclusion and exclusion in one $project.
      { $addFields: { similarityScore: { $meta: 'searchScore' } } },
      { $project: { embedding: 0 } },
    ];

    const rawResults = await this.collection.aggregate(pipeline).toArray();

    return rawResults.map((doc) => {
      const { similarityScore, ...hotelFields } = doc as HotelDocument & { similarityScore: number };
      return {
        hotel: hotelFields as Hotel,
        score: similarityScore ?? 0,
      };
    });
  }

  /** Returns true when the collection contains at least one document with an embedding. */
  async hasDocuments(): Promise<boolean> {
    const count = await this.collection.countDocuments({ embedding: { $exists: true } });
    return count > 0;
  }

  /** Drops the entire collection (used by the cleanup script). */
  async dropCollection(): Promise<void> {
    await this.collection.drop().catch(() => {
      // collection may not exist — that's fine
    });
    console.log(`Collection '${this.collection.collectionName}' dropped`);
  }
}
