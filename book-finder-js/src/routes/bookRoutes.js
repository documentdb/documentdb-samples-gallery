import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { bookService } from '../services/bookService.js';
import { embeddingService } from '../services/embeddingService.js';
import { similarityService } from '../services/similarityService.js';

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/books - Get all books
router.get(
  '/',
  [query('genre').optional().trim(), query('author').optional().trim()],
  validate,
  async (req, res) => {
    try {
      const { genre, author, limit = 100, skip = 0 } = req.query;
      const filters = {};
      if (genre) filters.genre = genre;
      if (author) filters.author = author;

      const books = await bookService.getAllBooks(filters, parseInt(limit), parseInt(skip));
      res.json({ count: books.length, books });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/books/:id - Get book by ID
router.get('/:id', async (req, res) => {
  try {
    const book = await bookService.getBookById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    res.json(book);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books - Create new book
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('author').trim().notEmpty().withMessage('Author is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('genre').optional().trim(),
    body('isbn').optional().trim(),
    body('publishYear').optional().isInt(),
    body('publisher').optional().trim(),
    body('pageCount').optional().isInt(),
    body('language').optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const book = await bookService.createBook(req.body);
      res.status(201).json(book);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PATCH /api/books/:id - Update book
router.patch('/:id', async (req, res) => {
  try {
    const book = await bookService.updateBook(req.params.id, req.body);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    res.json(book);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/books/:id - Delete book
router.delete('/:id', async (req, res) => {
  try {
    const book = await bookService.deleteBook(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/books/search - Semantic text search
router.post(
  '/search',
  [
    body('query').trim().isLength({ min: 3, max: 500 }).withMessage('Query must be 3-500 characters'),
    body('limit').optional().isInt({ min: 1, max: 50 }),
    body('genre').optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const { query, limit = 10, genre } = req.body;

      // Generate embedding for search query
      const queryEmbedding = await embeddingService.createEmbedding(query);

      // Search for similar books
      const results = await similarityService.searchByText(queryEmbedding, parseInt(limit), genre);

      res.json({
        query,
        count: results.length,
        results,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/books/:id/similar - Find similar books
router.post(
  '/:id/similar',
  [body('limit').optional().isInt({ min: 1, max: 50 }), body('genre').optional().trim()],
  validate,
  async (req, res) => {
    try {
      const { limit = 10, genre } = req.body;
      const bookId = req.params.id;

      // Get the book with embedding
      const book = await bookService.getBookWithEmbedding(bookId);
      if (!book) {
        return res.status(404).json({ error: 'Book not found' });
      }

      if (!book.embedding) {
        return res.status(400).json({ error: 'Book has no embedding' });
      }

      // Find similar books
      const results = await similarityService.findSimilarBooks(
        book.embedding,
        parseInt(limit) + 1, // Get one extra to exclude the query book
        bookId,
        genre
      );

      res.json({
        baseBook: {
          id: book._id,
          title: book.title,
          author: book.author,
        },
        count: results.length,
        results,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/books/stats/embeddings - Get embedding statistics
router.get('/stats/embeddings', async (req, res) => {
  try {
    const stats = await similarityService.getEmbeddingStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
