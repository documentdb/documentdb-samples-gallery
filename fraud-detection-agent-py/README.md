# Fraud Detection Multi-Agent System — Python

An AI-powered fraud detection pipeline built entirely on open-source tools. It uses a **three-agent architecture** — Retrieval, Analysis, and Decision — backed by **DocumentDB OSS native vector search** and locally running **Ollama LLMs** to classify incoming transactions as `APPROVE`, `REVIEW`, or `BLOCK`. No cloud accounts or API keys required.

## How it works

```
New Transaction
      │
      ▼
┌─────────────────────────────────────────────┐
│  Agent 1 — Retrieval                        │
│                                             │
│  1. Build semantic description of the tx    │
│  2. Embed with nomic-embed-text via Ollama  │
│  3. Vector search DocumentDB for top-k      │
│     similar historical transactions         │
└─────────────────┬───────────────────────────┘
                  │ top-k similar txns (with fraud labels)
                  ▼
┌─────────────────────────────────────────────┐
│  Agent 2 — Analysis                         │
│                                             │
│  llama3.2 identifies risk indicators,       │
│  trust signals, and overall risk level      │
│  (LOW / MEDIUM / HIGH)                      │
└─────────────────┬───────────────────────────┘
                  │ risk analysis JSON
                  ▼
┌─────────────────────────────────────────────┐
│  Agent 3 — Decision                         │
│                                             │
│  llama3.2 outputs the final verdict:        │
│  APPROVE / REVIEW / BLOCK                   │
│  + confidence score + recommended action    │
└─────────────────────────────────────────────┘
```

### Agent 1 — Retrieval

The retrieval agent does not call an LLM. Instead it:

1. Builds a semantic description from the transaction fields (description, merchant, category, amount, location).
2. Embeds that description using `nomic-embed-text` running locally in Ollama.
3. Runs a `$search` aggregation pipeline against DocumentDB using `cosmosSearch` vector similarity.
4. Returns the top-k most similar historical transactions, each annotated with a `similarityScore`.

The historical transactions include fraud labels, so the analysis agent can see which similar patterns were previously confirmed as fraud.

### Agent 2 — Analysis

The analysis agent calls `llama3.2` via Ollama's `/api/chat` endpoint. It receives:
- The new transaction details
- The top-k similar historical transactions with their fraud labels and similarity scores

It outputs a structured JSON with `risk_indicators`, `trust_signals`, `risk_level`, and `reasoning`.

### Agent 3 — Decision

The decision agent calls `llama3.2` a second time with a focused prompt: given the transaction and the analysis, produce a final `APPROVE`, `REVIEW`, or `BLOCK` decision with a `confidence` score and a `recommended_action` for the operations team.

## Open-source stack

| Component | Tool |
|---|---|
| LLM (Analysis + Decision agents) | [Ollama](https://ollama.com) (`llama3.2`, runs locally) |
| Embedding model | `nomic-embed-text` via Ollama (768 dimensions) |
| Vector database | [DocumentDB OSS](https://github.com/microsoft/documentdb) via Docker |
| MongoDB driver | [PyMongo](https://pymongo.readthedocs.io/) |
| Language | Python 3.10+ |

## Prerequisites

Install the following before getting started:

- **Python 3.10+** — [python.org](https://python.org)
- **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- **Ollama** — [ollama.com/download](https://ollama.com/download)

After installing Ollama, pull the required models:

```bash
ollama pull llama3.2          # used by Analysis and Decision agents
ollama pull nomic-embed-text  # embedding model (768 dimensions)
```

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
cd fraud-detection-agent-py
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your DocumentDB credentials:

| Variable | Default | Description |
|---|---|---|
| `DOCUMENTDB_URI` | — | Full MongoDB connection string |
| `DOCUMENTDB_DATABASE` | `frauddb` | Database name |
| `DOCUMENTDB_COLLECTION` | `transactions` | Collection name |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `OLLAMA_LLM_MODEL` | `llama3.2` | LLM for Analysis + Decision agents |
| `NEAREST_NEIGHBORS` | `5` | Top-k transactions retrieved per query |
| `EMBEDDING_DIMENSIONS` | `768` | Must match the embedding model output |

> **Windows tip:** If Ollama refuses connections, use `http://127.0.0.1:11434` instead of `http://localhost:11434` to avoid IPv6 issues.

### 4. Seed the database

Generates embeddings for all 20 historical transactions and inserts them with a vector index:

```bash
python upload_data.py
```

Expected output:
```
Loaded 20 transactions

Cleared existing collection

Generating embeddings and uploading...
  [ 1/20] [legit] Whole Foods Market: Regular weekly groceries purchased at local supermarket...
  [ 2/20] [legit] Planet Fitness: Monthly gym membership auto-renewal charged to card on file...
  ...
  [20/20] [FRAUD] ATM International Withdrawal: ATM cash withdrawal in foreign country immed...

Inserted 20 documents
Vector index created (vector-ivf, dimensions: 768, similarity: COS)
```

### 5. Run the agent pipeline

```bash
python main.py
```

## Expected output

```
Fraud Detection Multi-Agent System
Database : frauddb
LLM Model: llama3.2
Neighbors: 5

======================================================================

Transaction 1/5
  Merchant : RetailMart Gift Cards
  Amount   : $2400.00
  Location : Online
  Details  : Online purchase of high-value gift cards at multiple retailers within minutes...

[ Agent 1: Retrieval ] Finding similar historical transactions...
  Found 5 similar transactions (3 fraud, 2 legitimate)

[ Agent 2: Analysis  ] Identifying risk patterns...
  Risk Level : HIGH
  Indicators : Multiple gift cards in rapid succession, online purchase, high amount
  Trust      : None identified

[ Agent 3: Decision  ] Making final verdict...

  VERDICT : BLOCK (confidence: 92%)
  Reason  : Multiple high-value gift card purchases in rapid succession is a strong indicator of gift card fraud.
  Action  : Block transaction and flag account for security review.
```

## Changing the LLM

Any model available in Ollama works. Pull the model and update `OLLAMA_LLM_MODEL` in `.env`:

```bash
ollama pull mistral      # strong general-purpose model
ollama pull qwen2.5      # excellent reasoning
ollama pull phi3.5       # lightweight and fast
```

## Changing the embedding model

Update both `OLLAMA_EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS`, then re-run `python upload_data.py`:

| Model | Dimensions |
|---|---|
| `nomic-embed-text` | 768 |
| `mxbai-embed-large` | 1024 |
| `all-minilm` | 384 |

## Project structure

```
fraud-detection-agent-py/
├── data/
│   └── transactions.json         # 20 historical transactions (10 fraud, 10 legitimate)
├── agents/
│   ├── __init__.py
│   ├── retrieval_agent.py        # Agent 1: vector search in DocumentDB
│   ├── analysis_agent.py         # Agent 2: LLM pattern analysis
│   └── decision_agent.py         # Agent 3: final APPROVE/REVIEW/BLOCK verdict
├── utils/
│   ├── __init__.py
│   ├── db.py                     # MongoDB client factory
│   └── embeddings.py             # Ollama embedding helper
├── upload_data.py                # Seeds DocumentDB with embeddings + vector index
├── cleanup.py                    # Drops the transactions collection
├── main.py                       # Entry point: runs all 5 sample transactions
├── requirements.txt
├── .env.example                  # Template — copy to .env and fill in credentials
├── .gitignore
└── README.md
```

## Cleanup

Drop the transactions collection when you are done:

```bash
python cleanup.py
```
