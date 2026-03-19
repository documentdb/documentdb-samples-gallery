import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from utils.db import get_client, get_collection
from utils.embeddings import get_embedding


def build_embed_text(note: dict) -> str:
    return f"{note['chief_complaint']} {note['clinical_note']}"


def main():
    data_path = Path(__file__).parent / "data" / "clinical_notes.json"
    with open(data_path) as f:
        notes = json.load(f)

    print(f"Loaded {len(notes)} clinical notes\n")

    client = get_client()
    col = get_collection(client)
    col.drop()
    print("Cleared existing collection\n")

    print("Generating embeddings and uploading...")
    docs = []
    for i, note in enumerate(notes, 1):
        print(f"  [{i:2}/{len(notes)}] [{note['specialty']:<20}] {note['diagnosis'][:50]}...")
        note["embedding"] = get_embedding(build_embed_text(note))
        docs.append(note)

    col.insert_many(docs)
    print(f"\nInserted {len(docs)} note documents")

    dimensions = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))
    db_name = os.getenv("DOCUMENTDB_DATABASE", "clinicaldb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "notes")

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
    client.close()


if __name__ == "__main__":
    main()
