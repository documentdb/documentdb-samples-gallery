# Hotel Recommendation Agent — TypeScript

An AI-powered hotel recommendation system built entirely on open-source tools. It combines **DocumentDB OSS native vector search** with a **LlamaIndex synthesizer agent** to turn a plain-language query into a ranked, human-readable hotel recommendation — all running locally with no cloud accounts or API keys required.

## How it works

The app is split into two stages that mirror the classic **Retrieval-Augmented Generation (RAG)** pattern:

```
User Query
    │
    ▼
┌─────────────────────────────────────────┐
│  Stage 1 — Planner (Vector Search)      │
│                                         │
│  1. Embed the query with                │
│     nomic-embed-text via Ollama         │
│  2. Run $search aggregation on          │
│     DocumentDB OSS (cosine similarity)  │
│  3. Return top-k hotels with scores     │
└──────────────┬──────────────────────────┘
               │ top-k hotels + scores
               ▼
┌─────────────────────────────────────────┐
│  Stage 2 — Synthesizer Agent (LLM)      │
│                                         │
│  Receives the retrieved hotels and      │
│  calls llama3.2 via Ollama to write a   │
│  concise, comparative recommendation   │
└─────────────────────────────────────────┘
               │
               ▼
    Final Recommendation
```

### Stage 1 — Planner: native vector search

The planner does not use an LLM. Instead, it uses DocumentDB OSS's built-in `$search` aggregation stage to find hotels that are semantically similar to the user's query.

Here is what happens step by step:

1. The user's query (e.g. "hotel near running trails and restaurants") is sent to Ollama's `nomic-embed-text` model, which converts it into a 768-dimensional vector — a numerical representation of the query's meaning.

2. That vector is passed to `DocumentDBVectorStore.similaritySearch()`, which runs a native vector search pipeline against DocumentDB:

```
$search  →  cosmosSearch (vector + k)
$addFields  →  similarityScore: { $meta: 'searchScore' }
$project  →  exclude raw embedding arrays from results
```

3. DocumentDB scores every hotel document by cosine similarity between the stored embedding and the query embedding, then returns the top-k results sorted by score.

The vector index is created once during `npm run upload` using DocumentDB's `cosmosSearch` index type via `db.command()`. Three algorithms are supported: `vector-ivf` (default), `vector-hnsw`, and `vector-diskann`.

### Stage 2 — Synthesizer: LLM agent built with LlamaIndex

The synthesizer is where the AI agent lives. It is a direct LLM call built using LlamaIndex's `Ollama` class, which handles communication with a locally running Ollama server.

The agent is constructed from three components:

**1. A system prompt** (`SYNTHESIZER_SYSTEM_PROMPT`) that defines the agent's role, constraints, and output format. It instructs the agent to compare the top 3 hotels across rating, location, tags, and similarity score, identify tradeoffs, pick a best-overall recommendation, and stay under 220 words in plain text.

**2. A user prompt** (`createSynthesizerPrompt`) that combines the original user query with the formatted hotel data retrieved by the planner. Each hotel is formatted with its name, score, rating, category, location, tags, parking, and description.

**3. The LLM call** — `synthLlm.chat()` sends both prompts to `llama3.2` running locally via Ollama. The model reads the hotel context and produces a structured recommendation grounded entirely in the retrieved data.

```typescript
const response = await synthLlm.chat({
  messages: [
    { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
    { role: 'user',   content: createSynthesizerPrompt(query, hotelContext) },
  ],
});
```

This is an **instruction-following agent**: the system prompt defines what the agent is and what it must produce, and the user prompt supplies the data and task. There is no tool use or multi-step reasoning — the agent is given everything it needs in a single context window and asked to reason over it.

## Open-source stack

| Component | Tool |
|---|---|
| LLM + agent | [Ollama](https://ollama.com) (`llama3.2`, runs locally) |
| Embedding model | `nomic-embed-text` via Ollama (768 dimensions) |
| Agent framework | [LlamaIndex](https://www.llamaindex.ai/) (`Ollama` class) |
| Vector database | [DocumentDB OSS](https://github.com/microsoft/documentdb) via Docker |
| Language | TypeScript / Node.js |

## Prerequisites

Install the following before getting started:

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- **Ollama** — [ollama.com/download](https://ollama.com/download)

After installing Ollama, open a terminal and pull the two models used by this sample:

```bash
ollama pull llama3.2          # synthesizer agent
ollama pull nomic-embed-text  # embedding model (768 dimensions)
```

> On Windows, if `ollama` is not recognised after install, open a new terminal window or add `%LOCALAPPDATA%\Programs\Ollama` to your PATH. If Ollama refuses connections, use `http://127.0.0.1:11434` instead of `http://localhost:11434` in your `.env` file to avoid IPv6 issues.

## Setup

### 1. Start DocumentDB OSS

**macOS / Linux / Git Bash:**
```bash
docker run -dt \
  -p 10260:10260 \
  -e USERNAME=docdbuser \
  -e PASSWORD=Admin100! \
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

**Windows PowerShell:**
```powershell
docker run -dt `
  -p 10260:10260 `
  -e USERNAME=docdbuser `
  -e PASSWORD=Admin100! `
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

### 2. Install dependencies

```bash
cd hotel-agent-ts
npm install
```

> **Windows network tip:** If `npm install` hangs, try `npm install --prefer-ipv4`.

### 3. Configure environment variables

```bash
cp .env.example .env
```

The defaults work out of the box with the Docker command above. Edit `.env` if your setup differs:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_SYNTH_MODEL` | `llama3.2` | Model for the synthesizer agent |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `DOCUMENTDB_CONNECTION_STRING` | `mongodb://docdbuser:Admin100!@localhost:10260/...` | DocumentDB connection string |
| `DOCUMENTDB_DATABASE` | `Hotels` | Database name |
| `DOCUMENTDB_COLLECTION` | `hotel_data` | Collection name |
| `NEAREST_NEIGHBORS` | `5` | Number of hotels the planner retrieves |
| `VECTOR_INDEX_ALGORITHM` | `vector-ivf` | Index algorithm: `vector-ivf`, `vector-hnsw`, or `vector-diskann` |
| `EMBEDDING_DIMENSIONS` | `768` | Must match the embedding model's output size |
| `VECTOR_SIMILARITY` | `COS` | Similarity metric: `COS`, `L2`, or `IP` |

### 4. Seed the database

Reads `data/hotels.json`, generates a 768-dimensional embedding for each hotel description, inserts all 15 documents into DocumentDB, and creates the vector index.

```bash
npm run upload
```

Expected output:
```
Starting document upload...

Loaded 15 hotels

Generating embeddings via Ollama (this may take a minute)...
  [1/15] Oceanview Hotel & Suites
  [2/15] Nordick's Valley Motel
  ...
  [15/15] Trails End Motel

Inserted 15 hotel documents
Vector index created (algorithm: vector-ivf, dimensions: 768)
```

> Re-run `npm run upload` any time you change the embedding model. It clears the collection and rebuilds the index.

### 5. Run the agent

```bash
npm start
```

You will be prompted to enter a query or pick from a list of suggestions:

```
Example queries:
  1. Quintessential lodging near running trails, eateries, and retail
  2. Luxury spa resort with pool and fine dining
  3. Budget-friendly downtown hotel with good wifi
  4. Pet-friendly hotel near the beach
  5. Boutique hotel with rooftop bar and city views

Enter your query (or press Enter to use suggestion 1):
```

Type a number to pick a suggestion, press Enter for the default, or type your own query.

### Expected output

```
Connected to vector store: Hotels.hotel_data

Query: "Quintessential lodging near running trails, eateries, and retail"
Nearest neighbors: 5

--- PLANNER ---
Found 5 hotels from vector store
  Hotel: Riverside Runner's Inn, Score: 0.8412
  Hotel: Nordick's Valley Motel, Score: 0.7934
  Hotel: Trails End Motel, Score: 0.7801
  Hotel: Pacific Crest Trail Lodge, Score: 0.7643
  Hotel: Harbor House Inn, Score: 0.7512

--- SYNTHESIZER ---
Context size: 2847 characters
Output: 201 characters

--- FINAL ANSWER ---
1. Top 3 comparison:
• Riverside Runner's Inn (4.5): purpose-built running hotel on Lady Bird Lake trail, nutrition bar, nearby restaurants. No parking.
• Nordick's Valley Motel (4.5): D.C. motel near Potomac trails and retail. Free parking, strong rating.
• Trails End Motel (3.2): Scottsdale budget pick near eateries and Greenbelt trail. Free wifi and parking.

Key tradeoff: Riverside best matches all three criteria; Nordick's adds free parking.

2. Best overall: Riverside Runner's Inn.

3. Alternatives:
• Nordick's Valley Motel if free parking and historic sightseeing matter.
• Trails End Motel for a budget-friendly, walkable option.
```

## Changing the LLM

Any model available in Ollama works. Pull the model and update `OLLAMA_SYNTH_MODEL` in `.env`:

```bash
ollama pull mistral      # good general-purpose model
ollama pull qwen2.5      # strong reasoning
ollama pull phi3.5       # lightweight and fast
```

## Changing the embedding model

Update `OLLAMA_EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` together, then re-run `npm run upload`:

| Model | Dimensions |
|---|---|
| `nomic-embed-text` | 768 |
| `mxbai-embed-large` | 1024 |
| `all-minilm` | 384 |

## Vector index algorithms

DocumentDB OSS supports three vector index types, configurable via `VECTOR_INDEX_ALGORITHM` in `.env`:

| Algorithm | Best for |
|---|---|
| `vector-ivf` (default) | Small to medium datasets; fast to build |
| `vector-hnsw` | Larger datasets; higher recall |
| `vector-diskann` | Very large datasets; disk-based ANN |

## Cleanup

Drop the hotel collection when you are done:

```bash
npm run cleanup
```

## Development (no build step)

Run TypeScript files directly without compiling first:

```bash
npm run dev            # run the agent
npm run dev:upload     # seed the database
npm run dev:cleanup    # drop the collection
```

## Project structure

```
hotel-agent-ts/
├── data/
│   └── hotels.json               # 15 sample hotels (descriptions, ratings, tags)
├── src/
│   ├── agent.ts                  # Entry point: user prompt, planner, synthesizer
│   ├── upload-documents.ts       # Seeds DocumentDB with embeddings
│   ├── cleanup.ts                # Drops the hotel collection
│   ├── vector-store.ts           # Vector index creation and $search aggregation
│   └── utils/
│       ├── clients.ts            # Ollama and MongoDB client factory
│       ├── prompts.ts            # System prompt, user prompt, hotel formatter
│       └── types.ts              # TypeScript interfaces
├── .env.example                  # Template — copy to .env and edit
├── .gitignore
├── package.json
└── tsconfig.json
```
