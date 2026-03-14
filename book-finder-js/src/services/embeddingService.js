import OpenAI from 'openai';
import { config } from '../config/env.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export const embeddingService = {
  /**
   * Generate embedding for a single text
   */
  async createEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: config.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error.message);
      throw new Error('Failed to generate embedding');
    }
  },

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async createBatchEmbeddings(texts) {
    try {
      const response = await openai.embeddings.create({
        model: config.embeddingModel,
        input: texts,
      });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error('Error creating batch embeddings:', error.message);
      throw new Error('Failed to generate batch embeddings');
    }
  },

  /**
   * Create embedding from book title and description
   */
  async createBookEmbedding(title, description) {
    const combinedText = `${title}. ${description}`;
    return this.createEmbedding(combinedText);
  },
};
