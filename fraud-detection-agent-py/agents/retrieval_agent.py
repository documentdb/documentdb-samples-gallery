import os

from utils.embeddings import get_embedding


class RetrievalAgent:
    """Agent 1 — retrieves similar historical transactions via DocumentDB vector search."""

    def __init__(self, collection):
        self.collection = collection
        self.k = int(os.getenv("NEAREST_NEIGHBORS", "5"))

    def _build_description(self, transaction: dict) -> str:
        return (
            f"Transaction: {transaction['description']}. "
            f"Merchant: {transaction['merchant']}. "
            f"Category: {transaction['category']}. "
            f"Amount: ${transaction['amount']:.2f}. "
            f"Location: {transaction['location']}."
        )

    def run(self, transaction: dict) -> list:
        description = self._build_description(transaction)
        embedding = get_embedding(description)

        pipeline = [
            {
                "$search": {
                    "cosmosSearch": {
                        "vector": embedding,
                        "path": "embedding",
                        "k": self.k,
                    },
                    "returnStoredSource": True,
                }
            },
            {
                "$addFields": {
                    "similarityScore": {"$meta": "searchScore"}
                }
            },
            {
                "$project": {"embedding": 0}
            },
        ]

        return list(self.collection.aggregate(pipeline))
