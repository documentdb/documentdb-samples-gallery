# 📚 BookFinder - AI-Powered Semantic Book Discovery

A modern Node.js/Express application that uses OpenAI embeddings and MongoDB vector search to help users discover books through natural language queries.

## ✨ What is This?

Instead of traditional keyword searches, BookFinder understands what you mean. Search for:
- "coming of age story" → Get books about personal growth
- "dystopian future with rebellion" → Find relevant sci-fi
- "romance in Victorian England" → Discover period romances

The app generates AI embeddings (semantic vectors) for book descriptions and uses MongoDB's native vector search to find semantically similar matches.

## 🏗️ Tech Stack

- **Backend:** Node.js 18+, Express 4
- **Database:** MongoDB 6+ (with vector search support)
- **AI:** OpenAI `text-embedding-3-small` (1536 dimensions)
- **ODM:** Mongoose 8
- **Frontend:** Vanilla HTML/CSS/JavaScript

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18 or higher
- MongoDB 6+ or DocumentDB (with vector search support)
- OpenAI API key

### 2. Installation

```bash
# Clone or navigate to the project
cd Book\ Finder-js

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 3. Configuration

Edit `.env` with your settings:

```env
PORT=3000
MONGODB_URL=mongodb://localhost:27017/bookfinder
OPENAI_API_KEY=sk-proj-your-actual-key-here
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
```

### 4. Database Setup

**For DocumentDB:**
```bash
# Use Docker to run OSS DocumentDB
docker run -d -p 10260:27017 \
  -e POSTGRES_PASSWORD=password \
  docker.io/fdr/postgres-documentdb:latest
```

### 5. Seed Sample Data

```bash
# Import 13 classic books with embeddings
npm run seed
```

This will:
- Connect to your database
- Generate OpenAI embeddings for each book
- Store books in the `books` collection

### 6. Run the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Visit: **http://localhost:3000**

## 📂 Project Structure

```
Book Finder-js/
├── src/
│   ├── config/
│   │   ├── env.js              # Environment configuration
│   │   └── database.js         # MongoDB connection
│   ├── models/
│   │   └── Book.js             # Mongoose schema with indexes
│   ├── services/
│   │   ├── embeddingService.js # OpenAI embedding generation
│   │   ├── similarityService.js # Vector search operations
│   │   └── bookService.js      # CRUD operations
│   ├── routes/
│   │   ├── bookRoutes.js       # Book API endpoints
│   │   └── healthRoutes.js     # Health check endpoints
│   ├── scripts/
│   │   └── seed.js             # Database seeding script
│   └── server.js               # Express app entry point
├── public/
│   ├── index.html              # Frontend UI
│   ├── style.css               # Responsive styles
│   └── app.js                  # Client-side JavaScript
├── data/
│   └── books.json              # Sample book data
├── .env.example                # Environment template
├── package.json                # Dependencies & scripts
└── README.md                   # This file
```

## 🔌 API Endpoints

### Books

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/books` | List all books (with filters) |
| `GET` | `/api/books/:id` | Get single book |
| `POST` | `/api/books` | Create new book |
| `PATCH` | `/api/books/:id` | Update book |
| `DELETE` | `/api/books/:id` | Delete book |
| `POST` | `/api/books/search` | Semantic text search |
| `POST` | `/api/books/:id/similar` | Find similar books |
| `GET` | `/api/books/stats/embeddings` | Embedding statistics |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check with DB ping |
| `GET` | `/api/health/ping` | Simple ping (no DB) |

## 🔍 How It Works

### 1. Embedding Generation

When a book is created:

```javascript
// Combine title + description
const text = `${title}. ${description}`;

// Generate 1536-dimensional vector
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text
});

// Store in MongoDB
book.embedding = embedding.data[0].embedding;
```

### 2. Vector Search

When searching:

```javascript
// User query → embedding
const queryEmbedding = await embeddingService.createEmbedding(query);

// MongoDB aggregation pipeline with cosmosSearch
const results = await Book.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: 'embedding',
        k: 10,           // Return top 10
        lSearch: 100     // Search pool size
      }
    }
  },
  {
    $project: {
      title: 1,
      author: 1,
      similarityScore: { $meta: 'searchScore' }
    }
  }
]);
```

### 3. Similarity Scoring

Results include a `similarityScore` (0-1):
- `1.0` = Identical semantic meaning
- `0.9+` = Very similar
- `0.7-0.9` = Moderately similar
- `<0.7` = Loosely related

## 🛠️ Key Features

### Semantic Search
Natural language understanding powered by OpenAI embeddings.

### Vector Search Optimization
Uses MongoDB's native IVF (Inverted File) indexing for fast similarity queries.

### Auto-Embedding Updates
Embeddings regenerate automatically when title/description changes.

### Smart Filtering
Combine semantic search with genre filters or exclude specific books.

### Batch Processing
Seed script efficiently generates embeddings for multiple books.

### Clean Architecture
Layered design: Routes → Services → Models → Database

## 📊 Sample API Usage

### Semantic Search

```bash
curl -X POST http://localhost:3000/api/books/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "dystopian future",
    "limit": 5
  }'
```

**Response:**
```json
{
  "query": "dystopian future",
  "count": 5,
  "results": [
    {
      "_id": "...",
      "title": "1984",
      "author": "George Orwell",
      "description": "...",
      "similarityScore": 0.92
    }
  ]
}
```

### Find Similar Books

```bash
curl -X POST http://localhost:3000/api/books/{bookId}/similar \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 5,
    "genre": "Fantasy"
  }'
```

### Create Book

```bash
curl -X POST http://localhost:3000/api/books \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Midnight Library",
    "author": "Matt Haig",
    "description": "A library between life and death...",
    "genre": "Fiction",
    "publishYear": 2020
  }'
```

## 🎨 Frontend Features

- **Beautiful UI** with gradient background and smooth animations
- **Example queries** as clickable chips
- **Real-time stats** showing total books and embedding coverage
- **Similarity scores** displayed as percentage badges
- **Responsive design** for mobile and desktop
- **Error handling** with user-friendly messages

## ⚙️ Configuration Options

### Environment Variables

```env
# Server
PORT=3000                    # Server port
NODE_ENV=development         # Environment mode

# Database
MONGODB_URL=...              # DocumentDB connection string

# OpenAI
OPENAI_API_KEY=...           # Your API key
EMBEDDING_MODEL=...          # text-embedding-3-small
EMBEDDING_DIM=1536           # Vector dimensions
```

### Vector Search Parameters

In `similarityService.js`, you can adjust:

```javascript
{
  k: 10,         // Number of results
  lSearch: 100   // Candidate pool (100-1000)
}
```

- Higher `lSearch` = More accurate but slower
- Lower `lSearch` = Faster but may miss results

## 🧪 Development

```bash
# Start with auto-reload
npm run dev

# Reseed database
npm run seed

# Test health endpoint
curl http://localhost:3000/api/health
```

## 📝 Notes

- **Embeddings are excluded** from API responses (too large)
- **Auto-regeneration:** Changing title/description triggers new embedding
- **Indexes:** Mongoose creates indexes on genre, author, and text search
- **TLS Support:** DocumentDB requires `tls=true` in connection string

## 🚦 Common Issues

### "Failed to generate embedding"
- Check your `OPENAI_API_KEY` is valid
- Verify API quota/credits

### "MongoDB connection error"
- Ensure MongoDB is running
- Check connection string format
- For DocumentDB, verify TLS settings

### Search returns no results
- Run `npm run seed` to import sample books
- Check that embeddings were generated (check stats endpoint)

## 📄 License

MIT

---

**Built with ❤️ using Node.js, Express, MongoDB, and OpenAI**
