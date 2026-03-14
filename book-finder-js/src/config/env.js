import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  mongoUrl: process.env.MONGODB_URL || 'mongodb://localhost:27017/bookfinder',
  openaiApiKey: process.env.OPENAI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIM) || 1536,
  nodeEnv: process.env.NODE_ENV || 'development'
};
