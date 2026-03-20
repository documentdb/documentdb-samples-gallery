# Activity Log / Notification Service

A production-style async backend built with **FastAPI**, **Beanie**, and **DocumentDB** (MongoDB-compatible, open-source, powered by PostgreSQL).

The service ingests high-volume activity events, lets you query recent activities with flexible filters, computes server-side aggregation statistics, and streams real-time `ERROR` alerts to connected WebSocket clients.

---

## Architecture

```
HTTP clients          WebSocket clients
     │                      │
     ▼                      ▼
 FastAPI (Uvicorn)  ←────────────────────
     │
     │ Beanie ODM (async)
     │ Motor driver
     ▼
 DocumentDB (MongoDB-compatible gateway on port 10260)
```

---

## Prerequisites

- Python 3.11+
- Docker (to run DocumentDB locally)

---

## 1. Start DocumentDB locally

```bash
docker run -dt \
  -p 10260:10260 \
  -e USERNAME=<username> \
  -e PASSWORD=<password> \
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

Wait ~10 seconds for the container to finish initialising before running the app.

Verify connectivity with `mongosh` (optional):

```bash
mongosh localhost:10260 \
  -u <username> -p <password> \
  --authenticationMechanism SCRAM-SHA-256 \
  --tls \
  --tlsAllowInvalidCertificates
```

---

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and replace `<username>` / `<password>` with the values you passed to Docker:

```
DOCUMENTDB_URI=mongodb://<username>:<password>@localhost:10260/?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256
DOCUMENTDB_ALLOW_INVALID_CERTS=true
DOCDB_DB_NAME=activitydb
```

> **Security note:** `DOCUMENTDB_ALLOW_INVALID_CERTS=true` is only safe for the local dev container. Remove this line (or set it to `false`) against any real deployment and use a properly signed certificate.

---

## 3. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. Run the app

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## API reference

### POST /activities — Ingest an event

```bash
curl -s -X POST http://localhost:8000/activities \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-42",
    "action": "LOGIN",
    "level": "INFO",
    "metadata": {"ip": "10.0.0.1", "ua": "Mozilla/5.0"}
  }' | python -m json.tool
```

Ingest an ERROR event (triggers WebSocket alert):

```bash
curl -s -X POST http://localhost:8000/activities \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-42",
    "action": "API_CALL",
    "level": "ERROR",
    "metadata": {"endpoint": "/api/checkout", "status": 500}
  }' | python -m json.tool
```

**Response (201):**

```json
{
  "id": "6748abc123def456789...",
  "timestamp": "2025-03-20T12:34:56.789000+00:00",
  "user_id": "user-42",
  "action": "LOGIN",
  "level": "INFO",
  "metadata": {"ip": "10.0.0.1", "ua": "Mozilla/5.0"}
}
```

---

### GET /activities/recent — Query recent activities

```bash
# Last 10 events
curl -s "http://localhost:8000/activities/recent?limit=10" | python -m json.tool

# Filter by user
curl -s "http://localhost:8000/activities/recent?user_id=user-42" | python -m json.tool

# Filter by level
curl -s "http://localhost:8000/activities/recent?level=ERROR&limit=20" | python -m json.tool

# Combine filters
curl -s "http://localhost:8000/activities/recent?user_id=user-42&level=WARN&limit=5" | python -m json.tool
```

| Query param | Type | Default | Max |
|---|---|---|---|
| `limit` | int | 50 | 500 |
| `user_id` | string | — | — |
| `level` | INFO / WARN / ERROR | — | — |

---

### GET /activities/stats — Aggregation statistics

```bash
# Stats over the last 60 minutes (default)
curl -s "http://localhost:8000/activities/stats" | python -m json.tool

# Stats over the last 5 minutes
curl -s "http://localhost:8000/activities/stats?window_minutes=5" | python -m json.tool
```

**Response:**

```json
{
  "window_minutes": 60,
  "by_level": {
    "INFO": 1200,
    "WARN": 30,
    "ERROR": 5
  },
  "by_action": {
    "LOGIN": 300,
    "VIEW_PAGE": 800,
    "API_CALL": 135,
    "ERROR": 5
  }
}
```

Statistics are computed server-side on DocumentDB using a single `$facet` aggregation pipeline — no client-side reduction.

---

### GET /ws/alerts — Real-time ERROR alerts (WebSocket)

When a `POST /activities` request with `"level": "ERROR"` succeeds, the service broadcasts a JSON alert to all connected WebSocket clients.

**Test with `wscat`:**

```bash
npm install -g wscat
wscat -c ws://localhost:8000/ws/alerts
```

**Test with a minimal HTML page** — save as `ws_test.html` and open in a browser:

```html
<!DOCTYPE html>
<html>
<body>
  <h2>Activity Log Alerts</h2>
  <pre id="log"></pre>
  <script>
    const ws = new WebSocket("ws://localhost:8000/ws/alerts");
    ws.onmessage = e => {
      document.getElementById("log").textContent += e.data + "\n";
    };
    ws.onerror = e => console.error("WebSocket error", e);
  </script>
</body>
</html>
```

**Alert payload:**

```json
{
  "type": "alert",
  "level": "ERROR",
  "user_id": "user-42",
  "action": "API_CALL",
  "timestamp": "2025-03-20T12:34:56.789000+00:00"
}
```

---

## Data model

| Field | Type | Description |
|---|---|---|
| `id` | ObjectId | Auto-generated by DocumentDB |
| `timestamp` | datetime (UTC) | Defaults to server-side UTC now if omitted |
| `user_id` | str | Identifier of the acting user |
| `action` | str | e.g. `LOGIN`, `VIEW_PAGE`, `API_CALL`, `ERROR` |
| `level` | enum | `INFO`, `WARN`, or `ERROR` |
| `metadata` | dict | Arbitrary extra fields (IP, endpoint, UA, etc.) |

**Indexes created automatically by Beanie on first run:**

- Compound index on `(timestamp DESC, level ASC)` — supports recent-activity queries filtered by level.
- Index on `user_id` — supports per-user queries.

---

## Project layout

```
activity-log-fastapi-py/
├── app/
│   ├── __init__.py
│   ├── config.py          # Pydantic Settings — loads env vars
│   ├── database.py        # Motor client + Beanie initialisation
│   ├── models.py          # Beanie Document model + indexes
│   ├── schemas.py         # Pydantic request/response models
│   ├── websocket.py       # WebSocket connection manager
│   ├── main.py            # FastAPI app + lifespan + error handler
│   └── routes/
│       ├── __init__.py
│       ├── activities.py  # POST /activities, GET /activities/recent, /ws/alerts
│       └── stats.py       # GET /activities/stats
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Viewing data in DocumentDB

Install the [DocumentDB VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-documentdb) to browse your collections and documents directly from the editor.

Once installed, open the extension, add a new connection, and paste your connection string:

```
mongodb://<username>:<password>@localhost:10260/?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256
```

You can then browse the `activitydb` database and inspect documents in the `activities` collection.

---

## Resources

- [DocumentDB on GitHub](https://github.com/microsoft/documentdb)
- [DocumentDB VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-documentdb)
- [Beanie ODM docs](https://beanie-odm.dev)
- [FastAPI docs](https://fastapi.tiangolo.com)
