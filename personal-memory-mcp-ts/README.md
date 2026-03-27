# 🧠 Personal AI Memory: Cross-Platform MCP Server with DocumentDB

A TypeScript MCP (Model Context Protocol) server that gives **every AI assistant persistent, personalized memory** — backed by [DocumentDB](https://github.com/microsoft/documentdb).

Any MCP-compatible AI client — GitHub Copilot CLI, Claude Desktop, Gemini CLI — can read and write personal memories to a single DocumentDB instance, so every AI you talk to remembers who you are.

```
┌──────────────┐
│ Copilot CLI   │──┐
├──────────────┤  │    ┌────────────────┐    ┌──────────────────┐
│ Claude        │──┼───▶│  MCP Server    │───▶│   DocumentDB     │
├──────────────┤  │    │  (Express +    │    │   (MongoDB wire  │
│ Gemini CLI    │──┘    │   MCP SDK)     │    │    protocol)     │
└──────────────┘       └────────────────┘    └──────────────────┘
```

---

## Why DocumentDB?

This sample demonstrates why DocumentDB is a perfect fit for AI-powered applications:

| Feature | How This Sample Uses It |
|---------|------------------------|
| **Vector search (cosmosSearch)** | Semantic similarity search on memory embeddings — find related memories by meaning, not just keywords |
| **MongoDB wire protocol** | Standard MongoDB drivers (Node.js `mongodb` package) connect directly — zero code changes from MongoDB |
| **Full-text search indexes** | `$text` search on memory content for fast keyword retrieval — no external search engine needed |
| **Rich query language** | `$or`, `$regex`, `$in` operators for multi-strategy search (vector → text → tag → regex fallback) |
| **Server-side aggregation** | Memory ranking and filtering happen in the database, not in application code |
| **Flexible schema** | Memories have varying tags, sources, and metadata — DocumentDB handles this naturally |
| **Built-in TLS** | Secure connections out of the box, even for local development |
| **Docker-ready** | Single `docker compose up` starts a fully working DocumentDB instance |
| **Open source** | No cloud accounts, no API keys, no vendor lock-in — runs entirely on your machine |

---

## How It Works

The MCP server exposes 4 tools that any AI client can call:

| Tool | Description |
|------|-------------|
| `retrieve_memory` | Search memories using a 3-layer strategy powered by DocumentDB |
| `save_memory` | Store a new fact with category, importance, tags, and source tracking |
| `get_profile` | Aggregate all memories into a profile summary |
| `delete_memory` | Soft-delete a memory (preserves audit trail) |

### 4-Layer Search Strategy (All DocumentDB-Native)

```
Query: "What programming languages do I know?"
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
 Layer 0         Layer 1         Layer 2         Layer 3
 cosmosSearch    $text index     $in on tags     $regex on
 (vector)        (full-text)     array field     content field
    │               │               │               │
    └───────────────┼───────────────┼───────────────┘
                    ▼
            Merge + Deduplicate
                    │
                    ▼
          Decay-Score Re-ranking
          (recency × importance)
```

Each layer uses a different DocumentDB query capability:

0. **Vector search** — Uses `cosmosSearch` aggregation with pgvector-powered cosine similarity on embeddings (optional, requires Ollama)
1. **Full-text search** — Uses `$text: { $search: query }` on a DocumentDB text index
2. **Tag matching** — Uses `$in` operator on the `tags` array field
3. **Regex fallback** — Uses `$regex` with case-insensitive matching on `content`

Results are merged (deduplicated by `_id`), then re-ranked by a decay score that prioritizes recent, frequently-accessed, high-importance memories.

### Memory Data Model

```javascript
{
  _id: ObjectId("..."),
  content: "Software Engineer at Microsoft working on DocumentDB",
  category: "fact",           // fact | preference | event | person | correction | instruction
  importance: "high",         // high (3×) | medium (2×) | low (1×)
  tags: ["career", "microsoft", "documentdb"],
  embedding: [0.012, -0.034, ...],  // 768-dim vector (optional, via Ollama)
  source: {
    platform: "copilot",      // Which AI saved this
    agent_id: "copilot-cli"
  },
  supersedes: null,           // ID of memory this corrects
  access_count: 5,            // Times retrieved (for decay scoring)
  stability: 1.5,             // Grows with access (decay resistance)
  last_accessed_at: ISODate("2026-03-25T..."),
  created_at: ISODate("2026-03-20T..."),
  updated_at: ISODate("2026-03-25T..."),
  active: true                // false = soft-deleted
}
```

### DocumentDB Indexes Used

```javascript
// Compound index for filtered queries
{ category: 1, active: 1, created_at: -1 }

// Tag array index for $in queries
{ tags: 1 }

// Importance + active for profile generation
{ active: 1, importance: 1 }

// Full-text index for $text search
{ content: "text" }   // default_language: "english"

// Vector index for semantic similarity search (cosmosSearch)
{ embedding: "cosmosSearch" }   // vector-ivf, COS similarity, 768 dimensions
```

---

## Open-Source Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Database | [DocumentDB](https://github.com/microsoft/documentdb) | Memory storage, full-text search, vector search, query engine |
| Embeddings | [Ollama](https://ollama.com/) + nomic-embed-text | Local embedding generation for vector search (optional) |
| Server | [Express](https://expressjs.com/) + [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) | HTTP server with MCP protocol support |
| Language | TypeScript / Node.js 22 | Type-safe server implementation |
| Logging | [Pino](https://getpino.io/) | Structured JSON logging |
| Validation | [Zod](https://zod.dev/) | Runtime schema validation for MCP tool inputs |
| Testing | [Vitest](https://vitest.dev/) | Unit and integration tests |

**No cloud accounts required.** Everything runs locally with Docker.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+ (for development only)
- [Ollama](https://ollama.com/) (optional, for vector search)

### Enable Vector Search (Optional)

Install Ollama and pull the embedding model:

```bash
# Install Ollama from https://ollama.com, then:
ollama pull nomic-embed-text
```

The server auto-detects Ollama on startup. Without it, text/tag/regex search still works — vector search is simply skipped.

---

## Setup

You can run this sample with **local DocumentDB** (Docker) or **Azure Cosmos DB for MongoDB vCore** (cloud).

### Option A: Local DocumentDB (Docker)

#### 1. Start DocumentDB

From this sample's directory:

```bash
docker compose up -d
```

This starts DocumentDB on port `10260` (localhost only). Wait for it to be healthy:

```bash
docker compose ps
# documentdb should show "healthy"
```

#### 2. Install dependencies

```bash
cd mcp-server
npm install
```

#### 3. Configure environment

```bash
cp .env.example .env
```

The defaults work out of the box with the Docker Compose setup.

#### 4. Build and start the server

```bash
npm run build
npm start
```

### Option B: Azure VM with DocumentDB OSS

Deploy DocumentDB OSS on an Azure VM with a single script:

#### 1. Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed
- Logged in: `az login`

#### 2. Deploy

```bash
bash scripts/deploy-azure.sh
```

This creates:
- A resource group (`personal-memory-rg`)
- An Ubuntu VM with Docker installed (`Standard_B2s`)
- DocumentDB OSS running in a container on port `10260`
- A network rule opening port `10260`

The script outputs a `DOCUMENTDB_URI` — copy it to your `.env` file.

You can customize the deployment:

```bash
bash scripts/deploy-azure.sh \
  --vm-name my-docdb \
  --resource-group my-rg \
  --location westus \
  --vm-size Standard_B2s
```

#### 3. Install, configure, and start

```bash
cd mcp-server
npm install
cp .env.example .env
# Edit .env — paste the DOCUMENTDB_URI from the deploy script output
npm run build
npm start
```

#### Tear down Azure resources

```bash
az group delete --name personal-memory-rg --yes --no-wait
```

### After Setup (Both Options)

#### Verify it's running

```bash
# Health check (includes DocumentDB connectivity)
curl http://localhost:3000/health
# → {"status":"ok","service":"personal-memory-mcp","db":"connected"}
```

#### Seed example memories (optional)

```bash
source .env
bash ../scripts/seed-memories.sh
```

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCUMENTDB_URI` | DocumentDB connection string | `mongodb://admin:documentdb@localhost:10260/...` |
| `DB_NAME` | Database name | `personal_memory` |
| `MCP_SERVER_PORT` | Server port | `3000` |
| `AUTH_TOKEN` | Bearer token for authentication | `dev-token-change-me` |
| `NO_AUTH` | Disable auth for development | `false` |
| `LOG_LEVEL` | Pino log level (debug/info/warn/error) | `info` |
| `RATE_LIMIT_MAX` | Max requests per minute per IP | `60` |
| `OLLAMA_BASE_URL` | Ollama server URL (optional) | `http://127.0.0.1:11434` |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model name (optional) | `nomic-embed-text` |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (optional) | `768` |

---

## Connecting an AI Client

Once the server is running, configure your AI client to connect:

### GitHub Copilot CLI

Add to `~/.copilot/mcp-config.json`:

```json
{
  "servers": {
    "personal-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer dev-token-change-me"
      }
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "personal-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer dev-token-change-me"
      }
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "personal-memory": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer dev-token-change-me"
      }
    }
  }
}
```

---

## Testing

```bash
cd mcp-server

# Unit tests (no dependencies)
npm test -- tests/unit.test.ts

# Integration tests (requires running DocumentDB)
npm test -- tests/integration.test.ts

# All tests
npm test
```

---

## Project Structure

```
personal-memory-mcp-ts/
├── docker-compose.yml          # DocumentDB container
├── .env.example                # Environment variable template
├── mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Express server, auth, rate limiting
│   │   ├── server.ts           # MCP tool definitions (4 tools)
│   │   ├── memory.ts           # Search, save, delete, profile logic
│   │   ├── embeddings.ts       # Ollama embedding client (optional)
│   │   ├── db.ts               # DocumentDB connection with retry
│   │   ├── logger.ts           # Pino structured logging
│   │   └── types.ts            # TypeScript interfaces
│   └── tests/
│       ├── unit.test.ts        # Decay scoring + similarity tests
│       └── integration.test.ts # DocumentDB CRUD tests
├── scripts/
│   ├── deploy-azure.sh         # One-command Azure deployment
│   └── seed-memories.sh        # Seed example memories via MCP API
└── data/
    └── sample-memories.json    # Example memory data
```

---

## Key DocumentDB Features Demonstrated

### 1. Vector Search with cosmosSearch

```typescript
// Create a vector index (DocumentDB uses pgvector under the hood)
await db.command({
  createIndexes: "memories",
  indexes: [{
    key: { embedding: "cosmosSearch" },
    name: "idx_memory_embedding",
    cosmosSearchOptions: {
      kind: "vector-ivf",
      numLists: 1,
      similarity: "COS",
      dimensions: 768,
    },
  }],
});

// Semantic similarity search via aggregation pipeline
const results = await col.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,  // from Ollama nomic-embed-text
        path: "embedding",
        k: 15,
      },
      returnStoredSource: true,
    },
  },
  { $addFields: { similarityScore: { $meta: "searchScore" } } },
  { $match: { active: true } },
  { $project: { embedding: 0 } },
]).toArray();
```

### 2. Full-Text Search Index

```typescript
// Create a text index on memory content
await memories.createIndex(
  { content: "text" },
  { default_language: "english" }
);

// Search using $text
const results = await col
  .find({ active: true, $text: { $search: "programming languages" } })
  .limit(15)
  .toArray();
```

### 3. Array Field Queries

```typescript
// Tag-based retrieval using $in on array field
const tagResults = await col
  .find({ active: true, tags: { $in: ["career", "programming"] } })
  .limit(15)
  .toArray();
```

### 4. Compound Indexes for Filtered Queries

```typescript
// Compound index enables efficient filtered + sorted queries
await memories.createIndex({ category: 1, active: 1, created_at: -1 });

// Query uses the index for both filter and sort
const topMemories = await col
  .find({ active: true, category: "fact" })
  .sort({ created_at: -1 })
  .limit(50)
  .toArray();
```

### 5. Atomic Updates with Operators

```typescript
// Increment access count and update timestamp atomically
await col.updateMany(
  { _id: { $in: resultIds } },
  {
    $inc: { access_count: 1, stability: 0.1 },
    $set: { last_accessed_at: new Date() },
  }
);
```

### 6. Regex Search

```typescript
// Case-insensitive regex as a search fallback
const regexResults = await col
  .find({
    active: true,
    $or: keywords.map((kw) => ({
      content: { $regex: kw, $options: "i" },
    })),
  })
  .limit(15)
  .toArray();
```

---

## Cleanup

```bash
# Stop and remove containers
docker compose down

# Remove data volume
docker compose down -v
```

---

## Resources

- [DocumentDB GitHub](https://github.com/microsoft/documentdb) — Open-source MongoDB-compatible database
- [DocumentDB Documentation](https://learn.microsoft.com/azure/documentdb/) — Official docs
- [MCP Protocol Specification](https://modelcontextprotocol.io/) — Model Context Protocol standard
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — SDK used in this sample
