import { Book } from '../models/Book.js';
import { embeddingService } from './embeddingService.js';

export const bookService = {
  /**
   * Create a new book with embedding
   */
  async createBook(bookData) {
    const { title, description } = bookData;
    const embedding = await embeddingService.createBookEmbedding(title, description);

    const book = new Book({
      ...bookData,
      embedding,
    });

    await book.save();

    // Return without embedding
    const bookObj = book.toObject();
    delete bookObj.embedding;
    return bookObj;
  },

  /**
   * Get all books with optional filters
   */
  async getAllBooks(filters = {}, limit = 100, skip = 0) {
    const query = {};

    if (filters.genre) {
      query.genre = filters.genre;
    }

    if (filters.author) {
      query.author = { $regex: filters.author, $options: 'i' };
    }

    const books = await Book.find(query)
      .select('-embedding')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    return books;
  },

  /**
   * Get a single book by ID
   */
  async getBookById(id) {
    const book = await Book.findById(id).select('-embedding');
    return book;
  },

  /**
   * Update a book
   */
  async updateBook(id, updateData) {
    const book = await Book.findById(id);
    if (!book) {
      return null;
    }

    // Check if title or description changed (need to regenerate embedding)
    const needsNewEmbedding =
      (updateData.title && updateData.title !== book.title) ||
      (updateData.description && updateData.description !== book.description);

    if (needsNewEmbedding) {
      const title = updateData.title || book.title;
      const description = updateData.description || book.description;
      updateData.embedding = await embeddingService.createBookEmbedding(title, description);
    }

    Object.assign(book, updateData);
    await book.save();

    const bookObj = book.toObject();
    delete bookObj.embedding;
    return bookObj;
  },

  /**
   * Delete a book
   */
  async deleteBook(id) {
    const book = await Book.findByIdAndDelete(id);
    return book;
  },

  /**
   * Get book with embedding (for similarity search)
   */
  async getBookWithEmbedding(id) {
    const book = await Book.findById(id).select('+embedding');
    return book;
  },
};
