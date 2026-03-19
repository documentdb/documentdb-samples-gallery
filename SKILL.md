---
name: documentdb-builder
description: >
  Use this skill when building applications on top of DocumentDB — the open-source,
  MongoDB-compatible document database engine built on PostgreSQL. Covers spinning
  up a cluster, CRUD, indexing, aggregation, joins, the gateway, and best practices.
  Trigger when a user asks to build, query, or operate a DocumentDB instance, write
  application code against it, or understand how to structure data and queries.
---

# DocumentDB Builder Skill

## What Is DocumentDB?

DocumentDB is the engine powering [Azure DocumentDB](https://learn.microsoft.com/azure/documentdb/). It is a
**fully open-source** (MIT license), document-oriented NoSQL database engine built
natively on PostgreSQL. It exposes a MongoDB-compatible API while storing BSON documents
inside a PostgreSQL framework.

**Key capabilities:**
- CRUD operations on BSON documents
- Full-text search
- Geospatial queries
- Vector embeddings (RAG, similarity search)
- Aggregation pipelines
- Cross-collection joins via `$lookup`
- Background indexing (single-field, compound, TTL)

**Two core components:**
| Component | Role |
|---|---|
| `pg_documentdb_core` | PostgreSQL extension — adds BSON datatype and operations |
| `pg_documentdb` | Public API surface — CRUD, indexing, aggregation, collection management |

**Third component (optional):**
| Component | Role |
|---|---|
| `pg_documentdb_gw` | Gateway — protocol translation layer; accepts MongoDB wire protocol, maps to PostgreSQL |

---

## Architecture Overview

```
Your App (MongoDB driver / mongosh)
         │
         ▼
  pg_documentdb_gw          ← Accepts MongoDB wire protocol, SCRAM auth, TLS
  (DocumentDB Gateway)       ← Translates to PostgreSQL operations
         │
         ▼
  pg_documentdb              ← Public API: CRUD, indexes, aggregation, collections
         │
         ▼
  pg_documentdb_core         ← BSON datatype support inside PostgreSQL
         │
         ▼
     PostgreSQL               ← Storage, WAL, reliability
```

You can interact via:
1. **MongoDB client / mongosh** → through the Gateway (port `10260`)
2. **psql / SQL client** → direct PostgreSQL shell (port `9712`), using `documentdb_api.*` functions

---

## 1. Spinning Up DocumentDB

### Option A — Fastest: Prebuilt Docker Image with Gateway (Recommended for Development)

This gives you a full MongoDB-compatible endpoint with no build step.

```bash
docker run -dt \
  -p 10260:10260 \
  -e USERNAME=<username> \
  -e PASSWORD=<password> \
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

Connect with mongosh:

```bash
mongosh localhost:10260 \
  -u <username> -p <password> \
  --authenticationMechanism SCRAM-SHA-256 \
  --tls \
  --tlsAllowInvalidCertificates
```

### Option B — Docker Compose (Recommended for Sample Projects)

The cleanest way to run DocumentDB alongside your app in a sample. Create a
`docker-compose.yml` at the root of your project:

```yaml
version: "3.8"

services:
  documentdb:
    image: ghcr.io/microsoft/documentdb/documentdb-local:latest
    ports:
      - "10260:10260"
    environment:
      - USERNAME=docdbuser
      - PASSWORD=Admin100!
    restart: unless-stopped

  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - documentdb
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
```

Start everything together:

```bash
docker compose up -d
```

Stop and remove containers:

```bash
docker compose down
```

If your sample is app-only (DocumentDB runs separately), include just the `documentdb`
service and omit the `app` service. Your connection string should then point to
`host.docker.internal:10260` from inside other containers, or `localhost:10260` from
the host machine.

---

### Option C — Prebuilt Docker Image (PostgreSQL/psql access only)

```bash
# Pull image (Ubuntu 22.04, PostgreSQL 16, AMD64, version 0.103.0)
docker pull mcr.microsoft.com/cosmosdb/ubuntu/documentdb-oss:22.04-PG16-AMD64-0.103.0

# Run container
docker run -dt mcr.microsoft.com/cosmosdb/ubuntu/documentdb-oss:22.04-PG16-AMD64-0.103.0

# Shell into container
docker exec -it <container-id> bash

# Connect to psql
psql -p 9712 -d postgres
```

For external access (exposes port to host):

```bash
docker run -p 127.0.0.1:9712:9712 -dt \
  mcr.microsoft.com/cosmosdb/ubuntu/documentdb-oss:22.04-PG16-AMD64-0.103.0 -e
```

External psql connection:

```bash
psql -h localhost --port 9712 -d postgres -U documentdb
```

### Option D — Build from Source (Ubuntu/Debian)

If you want to build and run DocumentDB from source (instead of using Docker), follow these steps. This guide is designed for beginners and works best on Ubuntu/Debian. For other operating systems, package names may differ.

**Prerequisites**

*Recommended:* use the provided devcontainer for VSCode which contains all the dependencies pre-installed.

Or install the required dependencies manually:

```bash
sudo apt update
sudo apt install build-essential libbson-dev postgresql-server-dev-all pkg-config rustc cargo
```

**Step 1: Build PostgreSQL Extensions**

```bash
sudo make install
```

**Step 2: Build the Gateway**

```bash
scripts/build_and_install_with_pgrx.sh -i -d pg_documentdb_gw_host/
```

**Step 3: Start PostgreSQL and the Gateway**

```bash
scripts/start_oss_server.sh -c -g
```

**Step 4: Connect and Test**

Using a MongoDB client:

```bash
mongosh --host localhost --port 10260 --tls --tlsAllowInvalidCertificates \
  -u docdb_user -p Admin100
```

Using the PostgreSQL shell:

```bash
psql -p 9712 -d postgres
```

### Option E — Build Custom Debian/Ubuntu Packages

```bash
# Build packages for Debian 12, PostgreSQL 16
./packaging/build_packages.sh --os deb12 --pg 16
# Output lands in ./packages/ by default
```

---

## 2. Data Initialization

The emulator supports two modes on container startup.

### Default: Built-in Sample Data

Unless disabled, these collections are created in the `sampledb` database:
- `users` (5 records)
- `products` (5 records)
- `orders` (4 records)
- `analytics` (metrics + activity data)

### Skip Sample Data

```bash
docker run -p 10260:10260 -p 9712:9712 \
  --skip-init-data \
  --password mypassword \
  documentdb/local
```

### Custom Init Scripts (JavaScript)

```bash
docker run -p 10260:10260 -p 9712:9712 \
  -v /path/to/your/scripts:/init_doc_db.d \
  --init-data-path /init_doc_db.d \
  --password mypassword \
  documentdb/local
```

Scripts in the directory run in alphabetical order via `mongosh`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `INIT_DATA_PATH` | `/init_doc_db.d` | Directory containing `.js` init files |
| `SKIP_INIT_DATA` | `false` | Set `true` to skip built-in sample data |

> **Production note:** Always set `SKIP_INIT_DATA=true` and provide vetted scripts via `INIT_DATA_PATH` in production deployments.

---

## 3. CRUD Operations

All DocumentDB operations use the `documentdb_api` schema. Every function takes a
**database name** and a **JSON command** as arguments.

### Insert

```sql
-- Insert one document
SELECT documentdb_api.insert_one(
  'mydb',
  'users',
  '{"name": "Alice", "age": 30, "email": "alice@example.com"}'
);

-- Insert multiple documents
SELECT documentdb_api.insert(
  'mydb',
  '{"insert": "users", "documents": [
    {"name": "Bob", "age": 25},
    {"name": "Carol", "age": 35}
  ]}'
);
```

### Query / Find

```sql
-- Find all documents in a collection
SELECT document FROM documentdb_api.collection('mydb', 'users');

-- Find with filter
SELECT document FROM documentdb_api.collection('mydb', 'users')
WHERE document @@ '{"age": {"$gt": 28}}';
```

### Update

```sql
-- Update one document
SELECT documentdb_api.update(
  'mydb',
  '{"update": "users",
    "updates": [{"q": {"name": "Alice"}, "u": {"$set": {"age": 31}}}]
  }'
);
```

### Delete

```sql
-- Delete one document
SELECT documentdb_api.delete(
  'mydb',
  '{"delete": "users",
    "deletes": [{"q": {"name": "Bob"}, "limit": 1}]
  }'
);
```

---

## 4. Collection Management

### List Collections

```sql
SELECT * FROM documentdb_api.list_collections_cursor_first_page(
  'mydb',
  '{"listCollections": 1}'
);
```

### List Indexes on a Collection

```sql
SELECT documentdb_api.list_indexes_cursor_first_page(
  'mydb',
  '{"listIndexes": "users"}'
);
```

### Inspect TTL Jobs (pg_cron)

TTL indexes are scheduled via `pg_cron`. Inspect them with:

```sql
SELECT * FROM cron.job;
```

---

## 5. Indexing

Indexing uses `documentdb_api.create_indexes_background` — runs without blocking
database operations.

### Single-Field Index

```sql
SELECT * FROM documentdb_api.create_indexes_background(
  'mydb',
  '{"createIndexes": "users",
    "indexes": [{"key": {"age": 1}, "name": "idx_age"}]
  }'
);
```

### Compound Index

```sql
SELECT * FROM documentdb_api.create_indexes_background(
  'mydb',
  '{"createIndexes": "users",
    "indexes": [{"key": {"country": 1, "age": 1}, "name": "idx_country_age"}]
  }'
);
```

### Drop an Index

```sql
CALL documentdb_api.drop_indexes(
  'mydb',
  '{"dropIndexes": "users", "index": "idx_age"}'
);
```

### Indexing Best Practices

- Create indexes on fields used in `$match`, `$lookup` join keys, and sort stages.
- Use compound indexes when queries consistently filter on multiple fields together.
- Avoid over-indexing — each index adds write overhead.
- Prefer background creation (`create_indexes_background`) in production to avoid locking.
- Review index usage regularly and drop unused indexes.

---

## 6. Aggregation

DocumentDB supports MongoDB-compatible aggregation pipelines via
`documentdb_api.aggregate_cursor_first_page`.

### Group By (Count)

```sql
SELECT cursorpage FROM documentdb_api.aggregate_cursor_first_page(
  'mydb',
  '{"aggregate": "orders",
    "pipeline": [
      {"$group": {"_id": "$status", "total": {"$count": {}}}}
    ],
    "cursor": {"batchSize": 10}
  }'
);
```

### Bucket Aggregation

```sql
SELECT cursorpage FROM documentdb_api.aggregate_cursor_first_page(
  'mydb',
  '{"aggregate": "users",
    "pipeline": [
      {"$bucket": {
        "groupBy": "$age",
        "boundaries": [20, 30, 40, 50],
        "default": "other"
      }}
    ],
    "cursor": {"batchSize": 10}
  }'
);
```

### Collect Unique Values with $addToSet

```sql
SELECT cursorpage FROM documentdb_api.aggregate_cursor_first_page(
  'mydb',
  '{"aggregate": "orders",
    "pipeline": [
      {"$group": {
        "_id": "$customer_id",
        "products": {"$addToSet": "$product_name"}
      }}
    ],
    "cursor": {"batchSize": 10}
  }'
);
```

### Aggregation Pipeline Stages Supported

| Stage | Purpose |
|---|---|
| `$match` | Filter documents |
| `$group` | Group + reduce |
| `$project` | Shape output fields |
| `$sort` | Order results |
| `$limit` | Cap result size |
| `$unwind` | Flatten arrays |
| `$lookup` | Join from another collection |
| `$bucket` | Bucket documents by range |
| `$addToSet` | Collect unique values |

---

## 7. Joins (Cross-Collection `$lookup`)

DocumentDB supports MongoDB-style `$lookup` for joining data across collections.

### Example: Join patients with appointments

```sql
-- First, populate appointment data
SELECT documentdb_api.insert_one('mydb', 'appointments',
  '{"appt_id": "A001", "patient_id": "P001", "doctor": "Dr. Smith", "date": "2024-01-20"}'
);

-- Join: each patient with their appointments
SELECT cursorpage FROM documentdb_api.aggregate_cursor_first_page(
  'mydb',
  '{"aggregate": "patients",
    "pipeline": [
      {"$lookup": {
        "from": "appointments",
        "localField": "patient_id",
        "foreignField": "patient_id",
        "as": "appointments"
      }},
      {"$unwind": "$appointments"},
      {"$project": {"_id": 0, "name": 1, "appointments.doctor": 1, "appointments.date": 1}}
    ],
    "cursor": {"batchSize": 10}
  }'
);
```

**Best practice:** Create an index on the `foreignField` of the joined collection to
avoid full scans on the right-hand side of the join.

---

## 8. DocumentDB Gateway

The Gateway is a protocol translation layer: it accepts MongoDB wire protocol from
any MongoDB-compatible client and maps it to PostgreSQL operations.

### What the Gateway handles

| Capability | Detail |
|---|---|
| Protocol translation | MongoDB wire protocol → PostgreSQL operations |
| Authentication | SCRAM-SHA-256, mapped to PostgreSQL credentials |
| Transactions | `BEGIN`/`COMMIT`/`ROLLBACK` via `TransactionStore` |
| Cursor paging | `cursorId`-based paging with `getMore` |
| User management | `createUser`, `updateUser`, `dropUser` → PostgreSQL roles |
| TLS termination | Built-in |

### Build and run the Gateway manually

```bash
# Build
docker build . -f .github/containers/Build-Ubuntu/Dockerfile_gateway -t documentdb-gw

# Run (exposes port 10260)
docker run -dt -p 10260:10260 \
  -e USERNAME=<username> \
  -e PASSWORD=<password> \
  documentdb-gw

# Connect via mongosh
mongosh localhost:10260 -u <username> -p <password> \
  --authenticationMechanism SCRAM-SHA-256 \
  --tls \
  --tlsAllowInvalidCertificates
```

### Gateway Project Structure (`pg_documentdb_gw` — Cargo workspace)

```
pg_documentdb_gw/
├── documentdb_gateway/         # Binary entry point (Tokio runtime, TLS init)
├── documentdb_gateway_core/    # TCP wire protocol + PostgreSQL bridge
├── documentdb_macros/          # Proc-macro crate
└── documentdb_tests/           # End-to-end tests
    ├── commands/               # Per-command test validators
    ├── test_setup/             # Test client creation, gateway lifecycle
    └── utils/                  # Shared test utilities
```

---

## 9. Application Integration Patterns

### Connecting via Standard MongoDB Driver (Node.js)

```javascript
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://localhost:10260', {
  auth: { username: 'myuser', password: 'mypassword' },
  tls: true,
  tlsAllowInvalidCertificates: true, // dev only
});

await client.connect();
const db = client.db('mydb');
const users = db.collection('users');

// Insert
await users.insertOne({ name: 'Alice', age: 30 });

// Find
const result = await users.find({ age: { $gt: 25 } }).toArray();

// Update
await users.updateOne({ name: 'Alice' }, { $set: { age: 31 } });

// Delete
await users.deleteOne({ name: 'Alice' });
```

### Connecting via Standard MongoDB Driver (Python)

```python
from pymongo import MongoClient

client = MongoClient(
    'mongodb://localhost:10260',
    username='myuser',
    password='mypassword',
    tls=True,
    tlsAllowInvalidCertificates=True  # dev only
)

db = client['mydb']
users = db['users']

# Insert
users.insert_one({'name': 'Alice', 'age': 30})

# Find
for doc in users.find({'age': {'$gt': 25}}):
    print(doc)

# Update
users.update_one({'name': 'Alice'}, {'$set': {'age': 31}})

# Delete
users.delete_one({'name': 'Alice'})
```

### Python `get_client()` — safe pattern for samples

Always read the connection URI from an environment variable and exit with a clear
message if it is missing. Only enable `tlsAllowInvalidCertificates` when an explicit
env flag is set — do not default it to `True`, as that encourages insecure defaults
if the code is reused against a real deployment.

The connection string itself must always include `tls=true` and
`tlsAllowInvalidCertificates=true` (for the local container) as query parameters so
the intent is visible and auditable at the call site.

```python
import os
import sys
from pymongo import MongoClient


def get_client() -> MongoClient:
    uri = os.getenv("DOCUMENTDB_URI")
    if not uri:
        sys.exit(
            "Error: DOCUMENTDB_URI environment variable is not set.\n"
            "Copy .env.example to .env and fill in your connection string."
        )
    # tlsAllowInvalidCertificates is only safe for the local dev container.
    # Never enable this against a real deployment — use a valid certificate instead.
    allow_invalid_certs = os.getenv("DOCUMENTDB_ALLOW_INVALID_CERTS", "false").lower() == "true"
    return MongoClient(uri, tlsAllowInvalidCertificates=allow_invalid_certs)
```

`.env.example` for the local container (sets the flag explicitly):

```
DOCUMENTDB_URI=mongodb://<username>:<password>@localhost:10260/?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256
DOCUMENTDB_ALLOW_INVALID_CERTS=true
```

For a real deployment, omit `DOCUMENTDB_ALLOW_INVALID_CERTS` (it defaults to `false`)
and use a connection string without `tlsAllowInvalidCertificates=true`.

### Connecting via psql (Direct SQL)

```bash
# Local
psql -p 9712 -d postgres

# External
psql -h localhost --port 9712 -d postgres -U documentdb
```

---

## 10. Vector Search (RAG Workloads)

DocumentDB supports native vector indexing alongside document data — no separate
vector store required.

```sql
-- Create a collection with vector embeddings
SELECT documentdb_api.insert_one('mydb', 'articles',
  '{"title": "Intro to RAG",
    "content": "Retrieval Augmented Generation...",
    "embedding": [0.12, 0.87, 0.34, ...]
  }'
);

-- Create a vector index
SELECT * FROM documentdb_api.create_indexes_background(
  'mydb',
  '{"createIndexes": "articles",
    "indexes": [{
      "key": {"embedding": "cosmosSearch"},
      "name": "idx_vector",
      "cosmosSearchOptions": {
        "kind": "vector-ivf",
        "numLists": 1,
        "similarity": "COS",
        "dimensions": 1536
      }
    }]
  }'
);
```

LangChain and Semantic Kernel both support MongoDB-compatible vector stores and work
with DocumentDB through the Gateway without code changes.

### Similarity metrics — `COS`, `L2`, `IP`

Set via the `similarity` field in `cosmosSearchOptions`. Choose based on how your
embedding model was trained:

| Metric | Value | When to use |
|---|---|---|
| Cosine similarity | `COS` | Default choice for most text and multimodal embeddings. Measures the angle between vectors, ignoring magnitude. Use when vectors may not be normalised. |
| Euclidean distance | `L2` | Use when absolute distance in vector space matters — e.g. image embeddings or models explicitly trained with L2 loss. |
| Inner product | `IP` | Use only when vectors are already unit-normalised (magnitude = 1). Equivalent to cosine in that case but faster. Incorrect results if vectors are not normalised. |

When in doubt, use `COS`. Most popular embedding models (`nomic-embed-text`,
`text-embedding-ada-002`, `mxbai-embed-large`) are trained for cosine similarity.

### `numLists` tuning for `vector-ivf`

`numLists` controls how many inverted index partitions IVF builds. The rule of thumb
is `sqrt(n)` where `n` is the number of documents in the collection.

| Dataset size | Recommended `numLists` |
|---|---|
| < 100 documents | `1` |
| ~1 000 documents | `32` |
| ~10 000 documents | `100` |
| ~100 000 documents | `316` |
| ~1 000 000 documents | `1000` |

Setting `numLists` too high relative to the dataset size **degrades recall** — the
query probes too few documents per list and misses neighbours. Setting it too low
reduces the benefit of the index. For development and small samples, always start
with `numLists: 1`.

### Querying the vector index — `$search` aggregation (MongoDB driver)

Use the `$search` aggregation stage with `cosmosSearch` to run a vector similarity query.
`returnStoredSource: true` is **required** — without it the stage does not return the
source document fields, only internal metadata.

```javascript
const pipeline = [
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,   // number[] matching the index dimensions
        path: 'embedding',        // field that holds the stored vector
        k: 5,                     // number of nearest neighbours to return
      },
      returnStoredSource: true,   // REQUIRED — returns the full source document
    },
  },
  // Split into two stages — see projection gotcha below
  { $addFields: { similarityScore: { $meta: 'searchScore' } } },
  { $project: { embedding: 0 } },
];

const results = await collection.aggregate(pipeline).toArray();
```

### Projection gotcha — never mix inclusion and exclusion in one `$project`

DocumentDB does **not** allow a single `$project` stage to contain both an inclusion
(e.g. adding a computed field) and an exclusion (e.g. `embedding: 0`).

**This will throw** `Cannot do exclusion on field embedding in inclusion projection`:

```javascript
// ❌ WRONG — mixes inclusion ({ $meta: ... }) and exclusion (0) in one stage
{ $project: { similarityScore: { $meta: 'searchScore' }, embedding: 0 } }
```

**Fix — use two separate stages:**

```javascript
// ✅ CORRECT
{ $addFields: { similarityScore: { $meta: 'searchScore' } } },  // add the score
{ $project: { embedding: 0 } },                                  // then exclude
```

This pattern applies any time you need both a computed/meta field and an excluded field
in the same aggregation result.

---

## 11. Full-Text Search

```sql
-- Create a text index
SELECT * FROM documentdb_api.create_indexes_background(
  'mydb',
  '{"createIndexes": "articles",
    "indexes": [{"key": {"content": "text"}, "name": "idx_fts"}]
  }'
);

-- Full-text search query
SELECT document FROM documentdb_api.collection('mydb', 'articles')
WHERE document @@ '{"$text": {"$search": "retrieval augmented generation"}}';
```

---

## 12. Best Practices

### Schema Design
- Use consistent field names across documents in the same collection.
- Embed related data that is always read together; reference data that is accessed
  independently or is large.
- Avoid deeply nested arrays that require `$unwind` on every query — flatten at
  insert time where possible.

### Indexing
- Index every field used in `$match` filters and `$lookup` join keys.
- Compound indexes follow left-prefix rules — order fields by selectivity (most
  selective first).
- Use `create_indexes_background` always in production.
- Audit indexes periodically: unused indexes add write cost with no read benefit.

### Queries
- Always filter with `$match` as the first pipeline stage to reduce the working set
  early.
- Use projection (`$project`) to return only needed fields — reduces network and
  deserialization cost.
- Paginate large result sets using `cursor.batchSize` rather than fetching all
  documents at once.

### Operations
- Use `SKIP_INIT_DATA=true` in production — never ship with built-in sample data.
- Provide vetted initialization scripts via `INIT_DATA_PATH`.
- The Gateway's `TransactionStore` auto-cleans expired transactions — no manual
  cleanup needed.
- TTL indexes are scheduled via `pg_cron`; verify cron jobs are running with
  `SELECT * FROM cron.job`.

### Security
- Use SCRAM-SHA-256 authentication through the Gateway for all application connections.
- Never set `tlsAllowInvalidCertificates=true` in production.
- Scope PostgreSQL roles to the minimum required permissions using the Gateway's role
  system: `readAnyDatabase`, `readWriteAnyDatabase`.
- Disable built-in sample data and use `INIT_DATA_PATH` with your own scripts in
  production.

---

## 13. Quick Reference — Key Functions

| Operation | Function / Command |
|---|---|
| Insert one | `documentdb_api.insert_one(db, collection, doc)` |
| Insert many | `documentdb_api.insert(db, '{"insert": ..., "documents": [...]}')` |
| Find (SQL) | `SELECT document FROM documentdb_api.collection(db, collection)` |
| Update | `documentdb_api.update(db, '{"update": ..., "updates": [...]}')` |
| Delete | `documentdb_api.delete(db, '{"delete": ..., "deletes": [...]}')` |
| Create index | `documentdb_api.create_indexes_background(db, spec)` |
| Drop index | `documentdb_api.drop_indexes(db, spec)` |
| List collections | `documentdb_api.list_collections_cursor_first_page(db, spec)` |
| List indexes | `documentdb_api.list_indexes_cursor_first_page(db, spec)` |
| Aggregate | `documentdb_api.aggregate_cursor_first_page(db, pipeline)` |

---

## 14. Community and Resources

- **GitHub:** https://github.com/microsoft/documentdb
- **Discord:** https://aka.ms/documentdb_discord
- **Docs:** https://documentdb.io/docs
- **Roadmap:** https://github.com/orgs/microsoft/projects/1407/views/1
- **File Issues:** https://github.com/documentdb/documentdb/issues?q=is%3Aissue%20state%3Aopen%20label%3Adocumentdb-local
- **FerretDB integration:** https://github.com/FerretDB/FerretDB (uses DocumentDB as backend)
- **License:** MIT — https://opensource.org/license/mit
- **Contributing:** See `CONTRIBUTING.md` in the repo


---

## Appendix: Troubleshooting

| Issue | Fix |
|---|---|
| `make check` fails with wrong ownership error on `/tmp/data` | Drop `/home/documentdb/code/pg_documentdb_core/src/test/regress/tmp/` and rerun `make check` |
| Build fails inside container | Run `git config --global --add safe.directory /home/documentdb/code` inside the container, then retry `make` |
| Can't connect externally via psql | Run container with `-p 127.0.0.1:9712:9712` and the `-e` flag |
| mongosh connection refused | Verify Gateway is running on port 10260 and TLS flags are set |
| TTL index not expiring documents | Check `SELECT * FROM cron.job` — pg_cron must be running |
