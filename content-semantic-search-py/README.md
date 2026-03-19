# Content Semantic Search Portal — Python

A Flask web portal that stores articles, blogs, and PDF documents as MongoDB documents with vector embeddings in **DocumentDB OSS**. Users search by meaning — not just keywords — and get back the most semantically relevant content ranked by cosine similarity. Built entirely on open-source tools with no cloud accounts required.

## How it works

```
User Query (natural language)
         │
         ▼
 Embed with nomic-embed-text (768-dim)
         │
         ▼
  DocumentDB $search ──── cosine similarity ────► Ranked Results
  (vector-ivf index)       by semantic meaning      with scores
```

At ingest time, each document's title and content are concatenated and embedded into a 768-dimensional vector using `nomic-embed-text` running locally in Ollama. That vector is stored alongside the document in DocumentDB.

At search time, the user's query is embedded with the same model and DocumentDB's `$search` aggregation stage finds the most similar documents by cosine similarity — no keyword matching involved. This means a query for "neural networks and attention" will surface articles about transformers, BERT, and GPT even if those exact words don't appear in the article title.

## Open-source stack

| Component | Tool |
|---|---|
| Embedding model | [Ollama](https://ollama.com) `nomic-embed-text` (768 dimensions, runs locally) |
| Vector database | [DocumentDB OSS](https://github.com/microsoft/documentdb) via Docker |
| MongoDB driver | [PyMongo](https://pymongo.readthedocs.io/) |
| Web framework | [Flask](https://flask.palletsprojects.com/) |
| PDF extraction | [pypdf](https://pypi.org/project/pypdf/) |
| Language | Python 3.10+ |

## Prerequisites

- **Python 3.10+** — [python.org](https://python.org)
- **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- **Ollama** — [ollama.com/download](https://ollama.com/download)

After installing Ollama, pull the embedding model:

```bash
ollama pull nomic-embed-text
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
cd content-semantic-search-py
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
| `DOCUMENTDB_DATABASE` | `contentdb` | Database name |
| `DOCUMENTDB_COLLECTION` | `articles` | Collection name |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `FLASK_PORT` | `5000` | Port for the Flask web app |
| `NEAREST_NEIGHBORS` | `5` | Default number of results |
| `EMBEDDING_DIMENSIONS` | `768` | Must match the embedding model |

### 4. Ingest sample articles

Embeds all 15 sample articles and stores them in DocumentDB with a vector index:

```bash
python ingest.py
```

Expected output:
```
Loaded 15 sample articles

Cleared existing collection

Generating embeddings and uploading...
  [ 1/15] Understanding Transformer Architecture in Modern NLP...
  [ 2/15] Rising Sea Levels: Coastal Cities at Risk by 2050...
  ...
  [15/15] Generative AI in Creative Industries: Tools, Disruption...

Inserted 15 documents
Vector index created (vector-ivf, dimensions: 768, similarity: COS)
```

### 5. Start the web portal

```bash
python app.py
```

Open your browser at `http://localhost:5000`.

## Ingesting custom content

### Plain text file
```bash
python ingest.py --file my_post.txt --title "My Blog Post" --type blog --tags "AI,writing"
```

### PDF document
```bash
python ingest.py --file research_paper.pdf --title "Research Paper Title" --type research --tags "science,research"
```

### Options

| Flag | Description |
|---|---|
| `--file` | Path to a `.txt` or `.pdf` file |
| `--title` | Title for the document (required with `--file`) |
| `--type` | `article`, `blog`, or `research` (default: `article`) |
| `--tags` | Comma-separated tags |

## Sample queries to try

| Query | What it should surface |
|---|---|
| `neural networks and self-attention` | Transformer architecture article |
| `coastal flooding and climate adaptation` | Sea level rise article |
| `gene therapy for inherited diseases` | CRISPR/genomics article |
| `tracking people in public spaces` | Smart cities / surveillance blog |
| `eating habits that reduce heart disease` | Mediterranean diet research |
| `dark matter and early universe` | James Webb Telescope article |

## Project structure

```
content-semantic-search-py/
├── data/
│   └── articles.json              # 15 sample articles on varied topics
├── utils/
│   ├── __init__.py
│   ├── db.py                      # MongoDB client factory
│   └── embeddings.py              # Ollama embedding helper
├── templates/
│   ├── index.html                 # Search page
│   └── article.html               # Article detail page
├── static/
│   └── style.css                  # Styles
├── ingest.py                      # Loads sample data or custom files
├── app.py                         # Flask web application
├── requirements.txt
├── .env.example                   # Template — copy to .env
├── .gitignore
└── README.md
```

## Changing the embedding model

Update both `OLLAMA_EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` in `.env`, then re-run `python ingest.py` to rebuild all embeddings:

| Model | Dimensions |
|---|---|
| `nomic-embed-text` | 768 |
| `mxbai-embed-large` | 1024 |
| `all-minilm` | 384 |
