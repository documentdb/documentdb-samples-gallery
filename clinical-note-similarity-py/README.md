# Clinical Note Similarity Explorer — Python

> **Important:** All clinical notes in this sample are fictional and de-identified. This tool is for demonstration purposes only and is not intended for use with real patient data.

A Flask web application that stores de-identified clinical notes as documents with vector embeddings in **DocumentDB OSS**. Clinicians and researchers can search for similar cases using natural language descriptions — finding notes by clinical meaning rather than exact keyword matches. Built entirely on open-source tools with no cloud accounts required.

## Use cases

- Search by symptoms: *"patient with acute chest pain radiating to the left arm with ST elevation"*
- Search by presentation: *"shortness of breath not responding to bronchodilators with wheeze"*
- Search by findings: *"sudden onset facial droop, arm weakness, and slurred speech"*
- Research patterns: *"abdominal pain with right lower quadrant tenderness and fever"*

## How it works

```
Clinician Query (natural language)
         │
         ▼
  Embed with nomic-embed-text (768-dim)
         │
         ▼
  DocumentDB $search ──── cosine similarity ────► Similar Cases
  (vector-ivf index)      by clinical meaning      ranked by score
         │
    optional $match
    (specialty filter)
```

At ingest time, each note's chief complaint and clinical text are concatenated and embedded into a 768-dimensional vector using `nomic-embed-text`. At search time, the clinician's query is embedded with the same model and DocumentDB returns the most semantically similar cases — even when different clinical terminology is used.

## Open-source stack

| Component | Tool |
|---|---|
| Embedding model | [Ollama](https://ollama.com) `nomic-embed-text` (768 dimensions, runs locally) |
| Vector database | [DocumentDB OSS](https://github.com/microsoft/documentdb) via Docker |
| MongoDB driver | [PyMongo](https://pymongo.readthedocs.io/) |
| Web framework | [Flask](https://flask.palletsprojects.com/) |
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
cd clinical-note-similarity-py
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
| `DOCUMENTDB_DATABASE` | `clinicaldb` | Database name |
| `DOCUMENTDB_COLLECTION` | `notes` | Collection name |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `FLASK_PORT` | `5001` | Port for the Flask web app |
| `NEAREST_NEIGHBORS` | `5` | Default number of results |
| `EMBEDDING_DIMENSIONS` | `768` | Must match the embedding model |

### 4. Upload clinical notes

Embeds all 20 sample notes and stores them in DocumentDB with a vector index:

```bash
python upload_notes.py
```

Expected output:
```
Loaded 20 clinical notes

Cleared existing collection

Generating embeddings and uploading...
  [ 1/20] [Cardiology           ] Acute ST-Elevation Myocardial Infarction...
  [ 2/20] [Cardiology           ] Unstable Angina...
  ...
  [20/20] [Gastroenterology     ] Crohn's Disease Flare...

Inserted 20 note documents
Vector index created (vector-ivf, dimensions: 768, similarity: COS)
```

### 5. Start the web app

```bash
python app.py
```

Open your browser at `http://localhost:5001`.

## Sample queries to try

| Query | Expected specialty |
|---|---|
| `Sudden severe chest pain with ST elevation, diaphoresis, left arm radiation` | Cardiology |
| `Wheezing, dyspnea not responding to albuterol inhaler` | Pulmonology |
| `Sudden onset facial droop, arm weakness, and speech difficulty` | Neurology |
| `Abdominal pain migrating to right lower quadrant with fever` | Gastroenterology |
| `Knee pop after pivoting with immediate swelling and instability` | Orthopedics |
| `Fatigue, weight gain, cold intolerance, hair thinning, and constipation` | Endocrinology |
| `Spreading skin redness with warmth and fever after minor skin break` | Dermatology |

## Document schema

Each clinical note document stored in DocumentDB:

| Field | Type | Description |
|---|---|---|
| `note_id` | string | Unique identifier (e.g. `CN001`) |
| `specialty` | string | Medical specialty |
| `diagnosis` | string | Primary diagnosis |
| `age_group` | string | `18-35`, `36-50`, `51-65`, `65+` |
| `sex` | string | `M` or `F` |
| `chief_complaint` | string | Presenting complaint in one sentence |
| `clinical_note` | string | De-identified clinical summary (3-5 sentences) |
| `icd_code` | string | ICD-10 diagnosis code |
| `outcome` | string | `admitted`, `discharged`, `referred`, `follow-up` |
| `embedding` | array | 768-dimensional vector (excluded from search results) |

## Specialties covered

The sample dataset includes 20 notes across 7 specialties:

| Specialty | Notes | Diagnoses |
|---|---|---|
| Cardiology | 4 | STEMI, Unstable Angina, Atrial Fibrillation, Heart Failure |
| Pulmonology | 3 | Pneumonia, Asthma Exacerbation, COPD Exacerbation |
| Neurology | 3 | Migraine, Ischemic Stroke, Seizure |
| Gastroenterology | 3 | Appendicitis, GERD, Crohn's Disease |
| Orthopedics | 3 | Distal Radius Fracture, Lumbar Disc Herniation, ACL Tear |
| Endocrinology | 2 | Type 2 Diabetes, Hashimoto's Thyroiditis |
| Dermatology | 2 | Cellulitis, Plaque Psoriasis |

## Project structure

```
clinical-note-similarity-py/
├── data/
│   └── clinical_notes.json        # 20 fictional de-identified clinical notes
├── utils/
│   ├── __init__.py
│   ├── db.py                      # MongoDB client factory
│   └── embeddings.py              # Ollama embedding helper
├── templates/
│   ├── index.html                 # Search page
│   └── note.html                  # Full note detail page
├── static/
│   └── style.css                  # Styles
├── upload_notes.py                # Seeds DocumentDB with embeddings + vector index
├── cleanup.py                     # Drops the notes collection
├── app.py                         # Flask web application
├── requirements.txt
├── .env.example                   # Template — copy to .env
├── .gitignore
└── README.md
```

## Cleanup

Drop the notes collection when you are done:

```bash
python cleanup.py
```

## Disclaimer

This sample uses entirely fictional, de-identified clinical notes generated for demonstration purposes. It is not a medical device, clinical decision support system, or suitable for use with real patient data. Always consult qualified healthcare professionals for medical decisions.
