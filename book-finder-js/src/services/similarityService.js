import { Book } from '../models/Book.js';

export const similarityService = {
  /**
   * Find similar books using vector search
   * @param {number[]} queryEmbedding - The embedding vector to search with
   * @param {number} limit - Maximum number of results
   * @param {string} excludeId - Book ID to exclude from results
   * @param {string} genreFilter - Optional genre filter
   */
  async findSimilarBooks(queryEmbedding, limit = 10, excludeId = null, genreFilter = null) {
    const pipeline = [
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: 'embedding',
            k: limit,
            lSearch: 100, // Dynamic candidate list size
          },
          returnStoredSource: true,
        },
      },
      {
        $project: {
          title: 1,
          author: 1,
          description: 1,
          genre: 1,
          isbn: 1,
          publishYear: 1,
          publisher: 1,
          pageCount: 1,
          language: 1,
          createdAt: 1,
          updatedAt: 1,
          similarityScore: { $meta: 'searchScore' },
        },
      },
    ];

    // Add filters
    const matchStage = { $match: {} };
    if (excludeId) {
      matchStage.$match._id = { $ne: excludeId };
    }
    if (genreFilter) {
      matchStage.$match.genre = genreFilter;
    }

    // Add match stage if we have filters
    if (Object.keys(matchStage.$match).length > 0) {
      pipeline.push(matchStage);
    }

    const results = await Book.aggregate(pipeline);
    return results;
  },

  /**
   * Search books by text query
   */
  async searchByText(queryEmbedding, limit = 10, genreFilter = null) {
    return this.findSimilarBooks(queryEmbedding, limit, null, genreFilter);
  },

  /**
   * Get statistics about embeddings
   */
  async getEmbeddingStats() {
    const total = await Book.countDocuments();
    const withEmbeddings = await Book.countDocuments({ embedding: { $exists: true, $ne: null } });
    const withoutEmbeddings = total - withEmbeddings;

    return {
      totalBooks: total,
      booksWithEmbeddings: withEmbeddings,
      booksWithoutEmbeddings: withoutEmbeddings,
      coveragePercentage: total > 0 ? ((withEmbeddings / total) * 100).toFixed(2) : 0,
    };
  },
};
