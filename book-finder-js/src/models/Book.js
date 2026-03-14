import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    genre: {
      type: String,
      default: null,
    },
    isbn: {
      type: String,
      default: null,
    },
    publishYear: {
      type: Number,
      default: null,
    },
    publisher: {
      type: String,
      default: null,
    },
    pageCount: {
      type: Number,
      default: null,
    },
    language: {
      type: String,
      default: 'English',
    },
    embedding: {
      type: [Number],
      required: false,
      select: false, // Don't include in queries by default (too large)
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for efficient querying
bookSchema.index({ genre: 1 });
bookSchema.index({ author: 1 });
bookSchema.index({ title: 'text', author: 'text' });

export const Book = mongoose.model('Book', bookSchema);
