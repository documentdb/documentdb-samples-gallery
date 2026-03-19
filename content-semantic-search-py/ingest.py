"""
ingest.py — Load sample articles or custom files into DocumentDB with vector embeddings.

Usage:
  python ingest.py                                             # load all sample articles
  python ingest.py --file my_post.txt --title "Title" --type blog
  python ingest.py --file paper.pdf  --title "Title" --type research
"""

import argparse
import json
import os
import uuid
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from utils.db import get_client, get_collection
from utils.embeddings import get_embedding

MAX_CONTENT_CHARS = 2000


def extract_text_from_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text.strip())
        return "\n".join(parts)
    except ImportError:
        raise SystemExit("pypdf is required for PDF ingestion: pip install pypdf")


def extract_text_from_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(path)
    return path.read_text(encoding="utf-8")


def create_vector_index(client, db_name: str, col_name: str):
    dimensions = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))
    client[db_name].command({
        "createIndexes": col_name,
        "indexes": [{
            "key": {"embedding": "cosmosSearch"},
            "name": "idx_vector_embedding",
            "cosmosSearchOptions": {
                "kind": "vector-ivf",
                "numLists": 1,
                "similarity": "COS",
                "dimensions": dimensions,
            },
        }],
    })
    print(f"Vector index created (vector-ivf, dimensions: {dimensions}, similarity: COS)")


def load_sample_articles(col, client):
    data_path = Path(__file__).parent / "data" / "articles.json"
    with open(data_path) as f:
        articles = json.load(f)

    print(f"Loaded {len(articles)} sample articles\n")
    col.drop()
    print("Cleared existing collection\n")

    print("Generating embeddings and uploading...")
    docs = []
    for i, article in enumerate(articles, 1):
        text = f"{article['title']} {article['content']}"
        print(f"  [{i:2}/{len(articles)}] {article['title'][:60]}...")
        article["embedding"] = get_embedding(text[:MAX_CONTENT_CHARS])
        docs.append(article)

    col.insert_many(docs)
    print(f"\nInserted {len(docs)} documents")

    db_name = os.getenv("DOCUMENTDB_DATABASE", "contentdb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "articles")
    create_vector_index(client, db_name, col_name)


def ingest_file(col, client, file_path: str, title: str, content_type: str, tags: list):
    path = Path(file_path)
    if not path.exists():
        raise SystemExit(f"File not found: {file_path}")

    print(f"Extracting text from: {path.name}")
    content = extract_text_from_file(path)
    if len(content) > MAX_CONTENT_CHARS:
        print(f"  Content truncated to {MAX_CONTENT_CHARS} chars for embedding")
        embed_text = f"{title} {content[:MAX_CONTENT_CHARS]}"
    else:
        embed_text = f"{title} {content}"

    print("Generating embedding...")
    embedding = get_embedding(embed_text)

    doc = {
        "article_id": f"CUSTOM-{uuid.uuid4().hex[:8].upper()}",
        "title": title,
        "content": content[:5000],  # store up to 5000 chars
        "type": content_type,
        "tags": tags,
        "author": "Uploaded",
        "date": date.today().isoformat(),
        "embedding": embedding,
        "source_file": path.name,
    }

    col.insert_one(doc)
    print(f"Inserted: {doc['article_id']} — {title}")

    # Ensure vector index exists
    db_name = os.getenv("DOCUMENTDB_DATABASE", "contentdb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "articles")
    try:
        create_vector_index(client, db_name, col_name)
    except Exception as exc:
        # Ignore the expected "index already exists" case, surface others
        message = str(exc).lower()
        if "already exists" not in message:
            raise


def main():
    parser = argparse.ArgumentParser(description="Ingest content into DocumentDB")
    parser.add_argument("--file", help="Path to a .txt or .pdf file to ingest")
    parser.add_argument("--title", help="Title for the ingested document")
    parser.add_argument("--type", default="article",
                        choices=["article", "blog", "research"],
                        help="Content type (default: article)")
    parser.add_argument("--tags", default="",
                        help="Comma-separated tags (e.g. 'AI,technology,research')")
    args = parser.parse_args()

    client = get_client()
    col = get_collection(client)

    if args.file:
        if not args.title:
            raise SystemExit("--title is required when ingesting a file")
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        ingest_file(col, client, args.file, args.title, args.type, tags)
    else:
        load_sample_articles(col, client)

    client.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
