# DocumentDB Samples Gallery

A curated collection of ready-to-run code samples showing how to build real-world applications with [DocumentDB](https://github.com/documentdb/documentdb) — an open-source, MongoDB-compatible document database built on PostgreSQL.

Browse the gallery at **[documentdb.io/samples](https://documentdb.io/samples)**.

---

## What's in this repo

Each top-level folder is a self-contained sample application:

```
documentdb-samples-gallery/
├── book-finder-js/          # AI-powered semantic book search (Node.js + OpenAI)
├── hotel-agent-ts/          # Hotel recommendation agent — RAG + LLM synthesizer (TypeScript + Ollama)
├── retail-product-store-js/ # Full-stack retail product catalog (Node.js + Express)
├── SKILL.md                 # Claude Code skill — loads DocumentDB context into AI assistants
├── registry.yml             # Gallery metadata — edit this to add/update samples
└── ...
```

`registry.yml` is the source of truth for the gallery website. When a change to `registry.yml` is merged, the website automatically rebuilds and shows the updated list.

---

## Build Samples Faster with SKILL.md

This repo includes a [`SKILL.md`](./SKILL.md) file — a Claude Code skill that gives AI assistants deep, project-specific context about DocumentDB. Load it into your Claude Code session to get accurate, idiomatic help scaffolding samples, writing queries, configuring connections, and seeding data without needing to explain DocumentDB specifics every time.

### How hotel-agent-ts was built using SKILL.md

The [`hotel-agent-ts`](./hotel-agent-ts) sample was scaffolded entirely through a Claude Code session with `SKILL.md` loaded. Here is what that looked like in practice:

**1. The skill provided DocumentDB context up front.** Because SKILL.md encodes how DocumentDB's vector search works — the `cosmosSearch` index type, the `$search` aggregation stage, the `db.command()` workaround for non-standard index creation, and the two-stage `$addFields` + `$project` projection pattern — none of that had to be explained manually. Claude generated correct DocumentDB code on the first attempt.

**2. Architecture decisions were made collaboratively.** The sample went through several iterations — starting with LangChain and Azure OpenAI, then switching to LlamaIndex, then removing all cloud dependencies in favour of Ollama and DocumentDB OSS. At each step, Claude adapted the code while the skill kept the DocumentDB layer consistent.

**3. Real errors were caught and fixed in the session.** Errors like `Cannot do exclusion on field embedding in inclusion projection` (DocumentDB does not allow mixing `$project` inclusions and exclusions) and the IPv6 connection refusal (`ECONNREFUSED ::1:11434`) were diagnosed and fixed without leaving the chat. The SKILL.md context helped Claude recognise that the projection issue was a DocumentDB-specific constraint, not a generic MongoDB one.

**4. The final architecture reflects the skill's guidance.** The planner uses DocumentDB's native `$search` aggregation for vector retrieval — exactly as described in SKILL.md — rather than a third-party vector library. The synthesizer is a lightweight LLM agent built on top of that retrieval layer using LlamaIndex and a locally running Ollama model.

To build your own sample the same way, open a Claude Code session in this repo and type:

```
/documentdb-builder
```

Claude will load the SKILL.md context and be ready to help you scaffold, query, and connect to DocumentDB accurately from the start.

---

## Contributing a Sample

### 1. Build your sample

Create a new folder at the root of this repo with your sample code:

```
my-sample-name/
├── README.md          # required — explain what the sample does and how to run it
├── .env.example       # required if the sample uses env vars
├── .gitignore
└── src/
    └── ...
```

**Requirements for your sample folder:**
- A `README.md` that explains what it does, prerequisites, and how to run it
- A `.env.example` listing all required environment variables (never commit a real `.env`)
- Working code — the sample should run with `npm install && npm start` (or equivalent)

### 2. Register your sample

Add an entry to `registry.yml`:

```yaml
samples:
  - id: my-sample-name           # must match your folder name, kebab-case
    title: "My Sample Title"
    description: "One or two sentences describing what this sample demonstrates."
    language: Node.js            # see supported values below
    industry: AI/ML              # any descriptive string
    difficulty: Intermediate     # Beginner | Intermediate | Advanced
    tags:
      - Vector Search
      - OpenAI
    githubUrl: "https://github.com/documentdb/documentdb-samples-gallery/tree/main/my-sample-name"
```

**Supported `language` values** (controls the icon color on the gallery card):
`Python` · `Node.js` · `TypeScript` · `Go` · `Java` · `C#` · `Rust`

**`difficulty` must be exactly one of:** `Beginner` · `Intermediate` · `Advanced`

### 3. Open a pull request

```bash
git checkout -b feat/add-my-sample
git add my-sample-name/ registry.yml
git commit -m "feat: add my-sample-name"
git push origin feat/add-my-sample
```

Open a PR against `main`. Once merged, the gallery website rebuilds automatically.

---

## Samples

| Sample | Language | Difficulty | Tags |
|--------|----------|------------|------|
| [BookFinder: AI-Powered Semantic Book Discovery](./book-finder-js) | Node.js | Intermediate | Vector Search, OpenAI, Embeddings |
| [Hotel Recommendation Agent: RAG with Native Vector Search and LLM Synthesizer](./hotel-agent-ts) | TypeScript | Intermediate | Vector Search, RAG, AI Agent, LlamaIndex, Ollama, Open Source |
| [Retail Product Store: Full-Stack Product Catalog with DocumentDB](./retail-product-store-js) | Node.js | Beginner | Express, REST API, DocumentDB OSS, Full Stack |

---

## How the gallery website works

The website ([documentdb.github.io](https://documentdb.github.io)) runs a build-time script that:

1. Clones this repo
2. Reads `registry.yml`
3. Generates the gallery page with search and filtering

No website code changes are needed when you add a sample — only `registry.yml` matters.

---

## License

Each sample carries its own license (see the `LICENSE` file in each folder). The registry itself is MIT licensed.
