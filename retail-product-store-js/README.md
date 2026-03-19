# ShopDB — Retail Product Store

A simple retail product website that reads and displays products from **DocumentDB** — Microsoft's open-source, MongoDB-compatible document database built on PostgreSQL.

---

## What It Does

- Displays a product catalogue sourced live from a DocumentDB collection
- Supports **search**, **category filtering**, and **sorting** (price, rating, name)
- Clicking a product opens a detail modal with full specs and an "Add to Cart" interaction
- Backend is a lightweight Node.js + Express API; frontend is plain HTML/CSS/JS

---

## Architecture

```
Browser (HTML/CSS/JS)
        │
        │  HTTP
        ▼
  Node.js + Express          ← server.js  (port 3000)
        │
        │  MongoDB wire protocol (TLS + SCRAM-SHA-256)
        ▼
  DocumentDB Gateway         ← port 10260
        │
        ▼
  DocumentDB (PostgreSQL)    ← port 9712
```

---

## Prerequisites

Make sure you have the following installed before you start:

| Tool | Purpose | Minimum version |
|---|---|---|
| [Node.js](https://nodejs.org/) | Run the web server | 18+ |
| [Docker](https://www.docker.com/) | Run the DocumentDB container | Any recent version |
| [mongosh](https://www.mongodb.com/try/download/shell) *(optional)* | Verify your DB connection manually | 2.x |

---

## Project Structure

```
testsample/
├── public/
│   ├── index.html       # Store UI
│   ├── style.css        # Dark-theme styles
│   └── app.js           # Frontend fetch, filter, modal logic
├── server.js            # Express API — connects to DocumentDB
├── seed.js              # One-time script to load sample products
├── Dockerfile           # Containerise the web app (optional)
├── docker-compose.yml   # Run web app + DocumentDB together (optional)
├── .env.example         # Template — copy to .env and fill in credentials
└── package.json
```

---

## Setup

### 1. Start DocumentDB

Run DocumentDB locally using Docker. The image exposes a MongoDB-compatible gateway on port `10260`.

```bash
docker run -dt \
  -p 10260:10260 \
  -e USERNAME=<your-username> \
  -e PASSWORD=<your-password> \
  ghcr.io/microsoft/documentdb/documentdb-local:latest
```

> The container creates the user on first boot. Wait a few seconds after starting before connecting.

To verify the container is up:

```bash
docker ps
# You should see the documentdb-local container running on port 10260
```

To verify connectivity with mongosh:

```bash
mongosh localhost:10260 \
  -u <your-username> -p <your-password> \
  --authenticationMechanism SCRAM-SHA-256 \
  --tls --tlsAllowInvalidCertificates
```

---

### 2. Configure Environment Variables

Copy the example env file and fill in your DocumentDB credentials:

```bash
cp .env.example .env
```

Open `.env` and set your connection string:

```env
DOCUMENTDB_URI=mongodb://<username>:<password>@localhost:10260/?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256
DB_NAME=sampledb
PORT=3000
```

> **Never commit `.env` to source control.** It is already listed in `.gitignore`.

---

### 3. Install Dependencies

```bash
npm install
```

---

### 4. Seed Sample Products

This loads 8 sample products into the `sampledb.products` collection and creates indexes on `category`, `price`, and `rating`.

```bash
npm run seed
```

Expected output:

```
Connected to DocumentDB.
Seeded 8 products into 'sampledb.products'.
Indexes created.
```

> You can re-run this at any time — it clears and re-inserts all products.

---

### 5. Start the Server

```bash
npm start
```

Expected output:

```
Connected to DocumentDB — database: sampledb
Retail store running at http://localhost:3000
```

Open your browser at **http://localhost:3000**.

---

## API Endpoints

The server exposes a small REST API used by the frontend:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/products` | List products — supports `?category=`, `?sort=`, `?search=` |
| GET | `/api/products/:id` | Get a single product by ID |
| GET | `/api/categories` | List all distinct categories |

### Sort options for `/api/products`

| `sort` value | Behaviour |
|---|---|
| *(empty)* | Name A → Z (default) |
| `price_asc` | Price: low to high |
| `price_desc` | Price: high to low |
| `rating` | Highest rated first |

---

## Running with Docker Compose (Optional)

If you prefer to run the web app as a container alongside DocumentDB:

```bash
docker compose up --build
```

This builds the app image and injects credentials from your `.env` file automatically.

> Make sure your `.env` file uses `host.docker.internal` instead of `localhost` in the URI when running via Docker Compose so the app container can reach the DocumentDB container on the host.

---

## Sample Products

The seed script loads the following products:

| Product | Category | Price |
|---|---|---|
| Wireless Noise-Cancelling Headphones | Electronics | $249.99 |
| Ultra-Slim Laptop 14" | Electronics | $1,099.00 |
| Smart Watch Series X | Electronics | $399.00 |
| Running Shoes Pro | Footwear | $129.99 |
| Leather Crossbody Bag | Fashion | $89.95 |
| Organic Cotton T-Shirt | Fashion | $29.99 |
| Stainless Steel Water Bottle | Home & Kitchen | $34.99 |
| Ceramic Pour-Over Coffee Set | Home & Kitchen | $54.95 |

---

## DocumentDB Quick Reference

DocumentDB stores data as BSON documents and supports the full MongoDB wire protocol. You can also query it directly over SQL via psql on port `9712`.

```bash
# Connect via psql (direct PostgreSQL access)
psql -h localhost -p 9712 -d postgres -U documentdb

# Query the products collection in SQL
SELECT document FROM documentdb_api.collection('sampledb', 'products');
```

For more details on DocumentDB capabilities (aggregation, vector search, full-text search, joins), see [SKILL.md](./SKILL.md).

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `Seed failed: Invalid account` | DocumentDB user wasn't created | Wait 5–10 s after container start, then retry. Verify with mongosh first. |
| `Could not connect to DocumentDB` | Wrong URI or container not running | Check `docker ps` and confirm port 10260 is mapped. Double-check `.env`. |
| `npm install` hangs | Project is on a network drive (e.g. OneDrive) | Copy the folder to a local path (e.g. `C:\dev\retail-store`) and install there. |
| `getaddrinfo ENOTFOUND registry.npmjs.org` | Corporate proxy blocking npm | Configure `npm config set proxy` or run `npm install` inside Docker. |
| Page loads but no products appear | Collection is empty | Run `npm run seed` to populate the database. |
