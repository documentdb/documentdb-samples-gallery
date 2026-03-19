import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from utils.db import get_client, get_collection
from utils.embeddings import get_embedding


def build_description(tx: dict) -> str:
    return (
        f"Transaction: {tx['description']}. "
        f"Merchant: {tx['merchant']}. "
        f"Category: {tx['category']}. "
        f"Amount: ${tx['amount']:.2f}. "
        f"Location: {tx['location']}."
    )


def main():
    data_path = Path(__file__).parent / "data" / "transactions.json"
    with open(data_path) as f:
        transactions = json.load(f)

    print(f"Loaded {len(transactions)} transactions\n")

    client = get_client()
    col = get_collection(client)
    col.drop()
    print("Cleared existing collection\n")

    print("Generating embeddings and uploading...")
    docs = []
    for i, tx in enumerate(transactions, 1):
        label = "FRAUD" if tx.get("is_fraud") else "legit"
        print(f"  [{i:2}/{len(transactions)}] [{label:5}] {tx['merchant']}: {tx['description'][:55]}...")
        tx["embedding"] = get_embedding(build_description(tx))
        docs.append(tx)

    col.insert_many(docs)
    print(f"\nInserted {len(docs)} documents")

    dimensions = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))
    db_name = os.getenv("DOCUMENTDB_DATABASE", "frauddb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "transactions")

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
