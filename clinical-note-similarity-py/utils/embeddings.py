import os

import requests


def get_embedding(text: str) -> list:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    model = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
    response = requests.post(
        f"{base_url}/api/embeddings",
        json={"model": model, "prompt": text},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["embedding"]
