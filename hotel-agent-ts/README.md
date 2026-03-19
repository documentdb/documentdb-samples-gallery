# Hotel Recommendation Agent — TypeScript

An AI-powered hotel recommendation system built entirely on open-source tools. It uses a **two-agent architecture** with **DocumentDB OSS vector search**: a planner agent searches a vector-indexed hotel database for semantically similar results, and a synthesizer agent produces a concise comparative recommendation.

## Open-source stack

| Component | Tool |
|---|---|
| LLM + agents | [Ollama](https://ollama.com) (local) |
| Embedding model | `nomic-embed-text` via Ollama |
| Agent framework | [LlamaIndex](https://www.llamaindex.ai/) (`ReActAgent`, `FunctionTool`) |
| Database | [DocumentDB OSS](https://github.com/microsoft/documentdb) via Docker |
| Language | TypeScript / Node.js |

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────────────────┐
│  Planner Agent  (Ollama — llama3.2)     │
│  ReActAgent with hotel search tool      │
│  Refines query → calls vector search   │
└──────────────┬──────────────────────────┘
               │ tool call
               ▼
┌─────────────────────────────────────────┐
│  Hotel Search Tool                      │
│  Embeds query via nomic-embed-text      │
│  Runs $search aggregation on DocumentDB │
│  Returns top-k hotels with scores       │
└──────────────┬──────────────────────────┘
               │ formatted results
               ▼
┌─────────────────────────────────────────┐
│  Synthesizer  (Ollama — llama3.2)       │
│  Direct LLM call (no tools)             │
│  Compares hotels → writes recommendation│
└─────────────────────────────────────────┘
               │
               ▼
    Final Recommendation
```

The planner uses LlamaIndex's `ReActAgent`, which works with any Ollama model via text-based ReAct prompting — no function-calling API required. The synthesizer calls the LLM directly since it only generates text.

## Prerequisites

- **Node.js 20+**
- **Ollama** running locally with two models pulled:
  ```bash
  ollama pull llama3.2        # planner + synthesizer
  ollama pull nomic-embed-text # embeddings (768 dimensions)
  ```
- **DocumentDB OSS** running via Docker (see below)

## Setup

### 1. Start DocumentDB OSS

```bash
docker run -dt \
  -p 10260:10260 \
  -e USERNAME=docdbuser \
  -e PASSWORD=Admin100! \
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` point to `localhost:11434` for Ollama and `localhost:10260` for DocumentDB — no changes needed if you used the Docker command above.

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_PLANNER_MODEL` | `llama3.2` | Model for the planner agent |
| `OLLAMA_SYNTH_MODEL` | `llama3.2` | Model for the synthesizer |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model (768 dims) |
| `DOCUMENTDB_CONNECTION_STRING` | `mongodb://...@localhost:10260/...` | DocumentDB connection |

### 4. Seed the database

Reads `data/hotels.json`, generates embeddings for each hotel description, inserts the documents, and creates a vector index.

```bash
npm run upload
```

### 5. Run the agent

```bash
npm start
```

### Expected output

```
Connected to vector store: Hotels.hotel_data

Query: "quintessential lodging near running trails, eateries, and retail"
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

## Customising the query

```bash
QUERY="spa resort with pool and fine dining" npm start
QUERY="budget-friendly downtown hotel with good wifi" npm start
```

## Changing models

Any model available in Ollama works. For better instruction following:

```bash
ollama pull mistral      # good tool use
ollama pull qwen2.5      # strong reasoning
ollama pull phi3.5       # lightweight
```

Then update `OLLAMA_PLANNER_MODEL` / `OLLAMA_SYNTH_MODEL` in `.env`.

For a different embedding model, also update `EMBEDDING_DIMENSIONS` to match:

| Model | Dimensions |
|---|---|
| `nomic-embed-text` | 768 |
| `mxbai-embed-large` | 1024 |
| `all-minilm` | 384 |

> If you change the embedding model, re-run `npm run upload` to regenerate embeddings and recreate the index.

## Cleanup

```bash
npm run cleanup
```

Drops the hotel collection from DocumentDB.

## Development (no build step)

```bash
npm run dev           # run the agent
npm run dev:upload    # seed the database
npm run dev:cleanup   # drop the collection
```

## Project structure

```
hotel-agent-ts/
├── data/
│   └── hotels.json           # 15 sample hotels (no embeddings)
├── src/
│   ├── agent.ts              # Two-agent orchestration (entry point)
│   ├── upload-documents.ts   # Database seeding script
│   ├── cleanup.ts            # Collection cleanup script
│   ├── vector-store.ts       # DocumentDB vector index + $search aggregation
│   └── utils/
│       ├── clients.ts        # Ollama + MongoDB client factory
│       ├── prompts.ts        # System prompts and formatting helpers
│       └── types.ts          # TypeScript interfaces
├── .env.example
├── package.json
└── tsconfig.json
```
