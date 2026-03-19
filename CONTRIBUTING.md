# Contributing to DocumentDB Samples Gallery

Thank you for your interest in contributing! This guide walks you through adding a new sample, updating an existing one, or improving the repo in other ways.

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Fork and clone the repo](#2-fork-and-clone-the-repo)
3. [Build your sample](#3-build-your-sample)
4. [Sample folder requirements](#4-sample-folder-requirements)
5. [Register your sample in registry.yml](#5-register-your-sample-in-registryyml)
6. [Test your sample end to end](#6-test-your-sample-end-to-end)
7. [Open a pull request](#7-open-a-pull-request)
8. [PR review checklist](#8-pr-review-checklist)
9. [Tips for building samples faster with SKILL.md](#9-tips-for-building-samples-faster-with-skillmd)

---

## 1. Before you start

Check the existing samples and open PRs to avoid duplicating work:

- Browse the gallery: [documentdb.io/samples](https://documentdb.io/samples)
- Browse the repo: [github.com/microsoft/documentdb-samples-gallery](https://github.com/microsoft/documentdb-samples-gallery)
- Check open PRs and issues before starting something new

If you have an idea and want feedback before building, open a GitHub issue describing the sample you have in mind.

---

## 2. Fork and clone the repo

You will need your own fork to contribute — direct pushes to this repo are not permitted.

**Step 1 — Fork on GitHub**

Click **Fork** on the top-right of the repo page. This creates a copy under your GitHub account.

**Step 2 — Clone your fork**

```bash
git clone https://github.com/<your-username>/documentdb-samples-gallery.git
cd documentdb-samples-gallery
```

**Step 3 — Add the upstream remote** (so you can pull future changes)

```bash
git remote add upstream https://github.com/microsoft/documentdb-samples-gallery.git
```

**Step 4 — Create a branch for your sample**

Use a descriptive branch name:

```bash
git checkout -b feat/add-my-sample-name
```

---

## 3. Build your sample

Create a new folder at the root of the repo using kebab-case. The folder name becomes the sample ID and must be unique:

```
documentdb-samples-gallery/
└── my-sample-name/
    ├── README.md
    ├── .env.example
    ├── .gitignore
    └── src/
        └── ...
```

Keep each sample **self-contained** — all code, config, and data it needs should live inside its own folder.

---

## 4. Sample folder requirements

### README.md (required)

Every sample must have a `README.md` that covers:

- **What it does** — one paragraph describing the use case and architecture
- **Prerequisites** — software, accounts, or services required before running
- **Setup steps** — numbered steps from clone to running output
- **Expected output** — what the user should see when it works
- **Environment variables** — a table of all variables with defaults and descriptions
- **Cleanup** — how to stop services or remove data created by the sample

### .env.example (required if the sample uses environment variables)

- List every environment variable the sample reads
- Use safe placeholder values — never commit real credentials, API keys, or connection strings
- Add a comment above each variable explaining what it is

```bash
# Connection string for DocumentDB OSS running locally via Docker
DOCUMENTDB_CONNECTION_STRING=mongodb://docdbuser:Admin100!@localhost:10260/?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256
```

### .gitignore (required)

At minimum, ignore:

```
node_modules/
dist/
.env
*.js.map
```

Add language-specific entries as needed (e.g. `__pycache__/`, `*.pyc` for Python, `bin/` for Go).

### Working code

The sample must run successfully from a clean clone using standard commands:

| Language | Expected run command |
|---|---|
| Node.js / TypeScript | `npm install && npm start` |
| Python | `pip install -r requirements.txt && python main.py` |
| Go | `go run .` |
| Other | Document clearly in the README |

---

## 5. Register your sample in registry.yml

Add an entry to `registry.yml` at the root of the repo. The `id` must exactly match your folder name.

```yaml
samples:
  - id: my-sample-name
    title: "Short, descriptive title for the gallery card"
    description: "One or two sentences describing what this sample demonstrates and what technologies it uses."
    language: TypeScript        # see supported values below
    industry: AI/ML             # any descriptive string
    difficulty: Intermediate    # Beginner | Intermediate | Advanced
    tags:
      - Vector Search
      - DocumentDB OSS
    githubUrl: "https://github.com/microsoft/documentdb-samples-gallery/tree/main/my-sample-name"
```

**Supported `language` values** (controls the icon on the gallery card):

`Python` · `Node.js` · `TypeScript` · `Go` · `Java` · `C#` · `Rust`

**`difficulty` must be exactly one of:**

| Value | Meaning |
|---|---|
| `Beginner` | No prior DocumentDB or AI knowledge required; minimal setup |
| `Intermediate` | Assumes basic familiarity with the language and DocumentDB |
| `Advanced` | Multi-service architecture, production patterns, or complex queries |

---

## 6. Test your sample end to end

Before opening a PR, verify the sample works from a clean state:

- [ ] Delete `node_modules/` (or equivalent) and reinstall dependencies from scratch
- [ ] Copy `.env.example` to `.env` and fill in real values
- [ ] Run the setup steps exactly as written in your README
- [ ] Confirm the expected output matches what your README describes
- [ ] Run any cleanup steps and confirm they work
- [ ] Ensure no real credentials, keys, or personal data are committed

---

## 7. Open a pull request

**Step 1 — Stage and commit your changes**

Only include your sample folder and the `registry.yml` change:

```bash
git add my-sample-name/ registry.yml
git commit -m "feat: add my-sample-name"
```

**Step 2 — Push to your fork**

```bash
git push origin feat/add-my-sample-name
```

**Step 3 — Open the PR**

Go to the original repo on GitHub. You should see a prompt to open a pull request from your recently pushed branch. Click it, or navigate to **Pull requests → New pull request** and select your fork and branch.

In the PR description, include:

- What the sample demonstrates
- The tech stack used
- Any setup required to test it (e.g. Docker, API keys)
- A screenshot or copy of the expected output if possible

**Step 4 — Respond to review feedback**

A maintainer will review your PR. If changes are requested, push additional commits to the same branch — the PR will update automatically.

Once approved and merged, the gallery website rebuilds and your sample appears automatically.

---

## 8. PR review checklist

Reviewers will check the following before merging:

- [ ] Folder name matches `id` in `registry.yml`
- [ ] `README.md` covers all required sections
- [ ] `.env.example` present with no real secrets
- [ ] `.gitignore` excludes `.env`, build artifacts, and dependencies
- [ ] Sample runs successfully end to end from a clean clone
- [ ] `registry.yml` entry is valid YAML with correct `difficulty` and `language` values
- [ ] No unrelated files changed

---

## 9. Tips for building samples faster with SKILL.md

This repo includes a [`SKILL.md`](./SKILL.md) — a Claude Code skill that loads DocumentDB-specific knowledge into an AI assistant. Using it while building your sample means you do not need to explain DocumentDB's connection format, vector search syntax, aggregation pipeline constraints, or index creation patterns manually.

To use it in a Claude Code session:

```
/documentdb-builder
```

Claude will have full context about DocumentDB and can help you scaffold the sample, write queries, configure connections, and debug errors specific to DocumentDB without going off track.

---

## Questions?

Open a GitHub issue or join the community on [Discord](https://aka.ms/documentdb_discord).
