import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, render_template, request
from utils.db import get_client, get_collection
from utils.embeddings import get_embedding

app = Flask(__name__)

_client = None
_col = None


def get_col():
    global _client, _col
    if _col is None:
        _client = get_client()
        _col = get_collection(_client)
    return _col


def semantic_search(query: str, content_type: str, num_results: int) -> list:
    col = get_col()
    k = num_results if content_type == "all" else num_results * 3

    embedding = get_embedding(query)

    pipeline = [
        {
            "$search": {
                "cosmosSearch": {
                    "vector": embedding,
                    "path": "embedding",
                    "k": k,
                },
                "returnStoredSource": True,
            }
        },
        {
            "$addFields": {"similarityScore": {"$meta": "searchScore"}}
        },
        {
            "$project": {"embedding": 0}
        },
    ]

    if content_type and content_type != "all":
        pipeline.append({"$match": {"type": content_type}})

    pipeline.append({"$limit": num_results})

    return list(col.aggregate(pipeline))


def get_content_types() -> list:
    col = get_col()
    return sorted(col.distinct("type"))


@app.route("/")
def index():
    content_types = get_content_types()
    return render_template("index.html", content_types=content_types)


@app.route("/search", methods=["POST"])
def search():
    query = request.form.get("query", "").strip()
    content_type = request.form.get("content_type", "all")
    num_results = int(request.form.get("num_results", 5))
    content_types = get_content_types()

    results = []
    error = None

    if query:
        try:
            results = semantic_search(query, content_type, num_results)
        except Exception as e:
            error = str(e)

    return render_template(
        "index.html",
        query=query,
        results=results,
        content_type=content_type,
        num_results=num_results,
        content_types=content_types,
        error=error,
    )


@app.route("/article/<article_id>")
def article_detail(article_id):
    col = get_col()
    doc = col.find_one({"article_id": article_id}, {"embedding": 0})
    if not doc:
        return "Article not found", 404
    return render_template("article.html", article=doc)


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    print(f"Starting Content Semantic Search Portal on http://localhost:{port}")
    app.run(debug=True, port=port)
