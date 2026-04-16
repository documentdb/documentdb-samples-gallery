# Contoso Retail — DocumentDB Hybrid Demo

**One codebase. Any cloud. Zero vendor lock-in.**

A production-style retail application that runs the exact same code against Azure DocumentDB (managed cloud) and OSS DocumentDB (local containers) — switchable in real time from the UI. Built for the talk: *"One Codebase, Any Cloud: Building a Retail Database with OSS and Azure DocumentDB"*.

---

## Why This Matters for Retail

Retail businesses operate across multiple environments — cloud data centers, on-prem headquarters, and edge locations like warehouses and stores. Each has different requirements:

| Challenge | How This App Solves It |
|-----------|----------------------|
| **Cloud vendor lock-in** | Same MongoDB wire protocol works against Azure DocumentDB *and* OSS DocumentDB. Switch with one click — zero code changes. |
| **Edge & on-prem requirements** | Run OSS DocumentDB locally at warehouses for low-latency reads/writes, even when cloud connectivity is limited. |
| **Data sovereignty & compliance** | Keep sensitive data on-prem while syncing aggregated orders to the cloud for analytics. |
| **Multi-store order consolidation** | Each store (HQ, warehouse, edge) accumulates its own orders. "Sync to Azure" pushes them all to a central cloud database. |
| **AI-powered product discovery** | Vector search recommendations ("customers who viewed X also liked Y") work identically on local and cloud — powered by local Ollama embeddings. |
| **Disaster recovery** | If the cloud goes down, local stores keep operating. If a local node fails, Azure has the consolidated data. |

---

## What It Does

### Product Catalog
- 50 retail products across Electronics, Apparel, Home, and Sports
- Full-text search across names and descriptions
- Vector similarity recommendations (768-dim embeddings via Ollama + nomic-embed-text)
- Category filtering with pagination

### Inventory Management
- Real-time stock levels across 3 warehouses (Seattle, Austin, Chicago)
- Increment/decrement stock with immediate feedback
- Low-stock alerts when inventory drops below reorder threshold

### Order Processing
- Place orders with SKU validation
- Order status lifecycle: `pending → confirmed → shipped → delivered`
- Per-store order isolation — each location tracks its own orders

### Live Database Switching
- Dropdown in the top nav to switch between Azure DocumentDB, On-Prem HQ, and Edge Warehouse **at runtime**
- Server hot-swaps the MongoDB connection — no restart needed
- Connection badge shows current target and latency

### Sync to Azure
- One-click "Sync to Azure" button pushes new orders from all local stores → Azure
- De-duplicates by order ID — safe to run repeatedly
- Enriches synced orders with `_syncedFrom` and `_syncedAt` metadata for audit

### Hybrid Replication (Demo)
- Spin up On-Prem HQ and Edge Warehouse DocumentDB containers live from the UI
- Write Test: measures round-trip latency to Azure vs. local replicas
- Animated timeline visualization of the write path
- Shows the real latency trade-offs: Azure (~100ms remote) vs. local (~5ms)

### Activity Log
- Real-time terminal panel at the bottom of the page
- Streams every operation: queries, searches, inventory changes, orders, DB switches, syncs
- Color-coded: green (success), blue (info), amber (warnings), red (errors)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│             Contoso Retail (Browser)              │
│   Products │ Inventory │ Orders │ Replication     │
│   DB Dropdown │ Sync Button │ Activity Log        │
└──────────────────────┬───────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────┴───────────────────────────┐
│         Express.js + TypeScript Server            │
│                                                   │
│  Services: Product, Inventory, Order, Embedding,  │
│            Recommendation, Replication             │
│                                                   │
│  Ollama (nomic-embed-text, 768-dim) ─── :11434   │
└───────┬──────────────┬───────────────┬───────────┘
        │              │               │
        │  mongodb driver (same code)  │
        │              │               │
   ┌────▼────┐   ┌────▼────┐   ┌─────▼─────┐
   │  Azure  │   │ On-Prem │   │   Edge    │
   │ DocDB   │   │   HQ    │   │ Warehouse │
   │ (cloud) │   │  :10261 │   │  :10262   │
   └─────────┘   └─────────┘   └───────────┘
    Managed        Docker          Docker
```

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Docker Desktop** (running)

### Setup

```bash
# Install dependencies
npm install

# Pull Docker images & download the embedding model (one-time)
npm run demo:pull

# Start DocumentDB + Ollama containers
docker compose up -d

# Seed the database (50 products with embeddings, 150 inventory records)
npm run seed

# Start the development server
npx tsx src/server.ts
```

Open **http://localhost:3000**

### Seed Replica Stores

To populate the warehouse (or HQ) with products and inventory:

```bash
# Seed all replicas
npm run seed:replicas

# Or seed just the warehouse
npm run seed:replicas warehouse
```

### Sync Orders to Azure

After placing orders on local stores, push them to Azure:

```bash
# Via CLI
npm run sync:orders

# Or click "🔄 Sync to Azure" in the browser
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DOCUMENTDB_URI` | Azure DocumentDB connection string (cloud primary) |
| `PRIMARY_URI` | Local DocumentDB container (port 10260) |
| `HQ_REPLICA_URI` | On-Prem HQ replica (port 10261) |
| `WAREHOUSE_REPLICA_URI` | Edge Warehouse replica (port 10262) |
| `DB_NAME` | Database name (default: `retaildb`) |
| `OLLAMA_URL` | Ollama API URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Embedding model (default: `nomic-embed-text`) |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (default: `768`) |

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/products` | Paginated product list (`limit`, `offset`, `category`) |
| GET | `/products/search?q=` | Full-text search |
| GET | `/products/:id` | Single product |
| GET | `/inventory/:sku` | Stock levels across all warehouses |
| PATCH | `/inventory/:sku/adjust` | Adjust stock (`{ warehouseId, delta }`) |
| GET | `/orders` | List recent orders (`limit`) |
| POST | `/orders` | Create order (`{ customerId, items, shippingAddress }`) |
| GET | `/orders/:id` | Get order by ID |
| PATCH | `/orders/:id/status` | Update order status |
| GET | `/recommendations?productId=` | Vector similarity recommendations |
| GET | `/health` | Connection status and latency |
| GET | `/db-target` | Current database target |
| POST | `/db-target` | Switch database target (`{ target: "azure" \| "hq" \| "warehouse" }`) |
| POST | `/sync` | Sync orders from all local stores → Azure |
| GET | `/logs` | SSE stream of server activity |
| GET | `/replication/status` | Replication topology state |
| POST | `/replication/enable` | SSE stream: start a replica node |
| POST | `/replication/write-test` | Latency benchmark across nodes |
| POST | `/replication/reset` | Tear down replica containers |

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Docker containers + dev server (hot reload) |
| `npm run seed` | Seed primary DB with products, inventory, and orders |
| `npm run seed:replicas` | Copy products + inventory to HQ/Warehouse replicas |
| `npm run sync` | Full sync: local primary → Azure (all collections) |
| `npm run sync:orders` | Sync only orders from all stores → Azure |
| `npm run demo:pull` | Pre-pull Docker images + Ollama model |
| `npm run demo:reset` | Tear down all replica containers |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled JS |

---

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript (strict mode)
- **Framework**: Express.js
- **Database**: MongoDB driver 6.x (no Mongoose) — compatible with DocumentDB
- **Embeddings**: Ollama with `nomic-embed-text` (768-dim, runs locally via Docker)
- **Vector Search**: HNSW index via `cosmosSearch` with `$search` aggregation
- **Containers**: Docker Compose (DocumentDB local image + Ollama)
- **Frontend**: Single-file vanilla HTML/CSS/JS with SSE for live updates

---

## Conference Demo Flow

### Act 1 — Environment Switching (90 seconds)

1. Show the app running with products, search, recommendations — all on **Azure DocumentDB**
2. Use the dropdown to switch to **Edge Warehouse** — products load instantly from local
3. Place an order on the warehouse
4. Switch back to **Azure** — order doesn't exist there yet
5. Click **"Sync to Azure"** — watch the activity log stream the sync
6. Refresh orders — the warehouse order now appears with `_syncedFrom` metadata

### Act 2 — Hybrid Replication (90 seconds)

1. Go to the **Hybrid Replication** tab
2. Click **▶ Connect** on On-Prem HQ — watch the container spin up live
3. Click **⚡ Run Write Test** — timeline shows Azure ACK (~100ms) vs. Replica ACK (~5ms)
4. Connect Edge Warehouse — both replicas green
5. Click **Reset Demo** — everything tears down cleanly, demo is repeatable
