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


def similarity_search(query: str, specialty: str, num_results: int) -> list:
    col = get_col()
    k = num_results if specialty == "all" else num_results * 4

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

    if specialty and specialty != "all":
        pipeline.append({"$match": {"specialty": specialty}})

    pipeline.append({"$limit": num_results})

    return list(col.aggregate(pipeline))


def get_specialties() -> list:
    col = get_col()
    return sorted(col.distinct("specialty"))


@app.route("/")
def index():
    specialties = get_specialties()
    return render_template("index.html", specialties=specialties)


@app.route("/search", methods=["POST"])
def search():
    query = request.form.get("query", "").strip()
    specialty = request.form.get("specialty", "all")
    num_results = int(request.form.get("num_results", 5))
    specialties = get_specialties()

    results = []
    error = None

    if query:
        try:
            results = similarity_search(query, specialty, num_results)
        except Exception as e:
            error = str(e)

    return render_template(
        "index.html",
        query=query,
        results=results,
        specialty=specialty,
        num_results=num_results,
        specialties=specialties,
        error=error,
    )


@app.route("/note/<note_id>")
def note_detail(note_id):
    col = get_col()
    doc = col.find_one({"note_id": note_id}, {"embedding": 0})
    if not doc:
        return "Note not found", 404
    return render_template("note.html", note=doc)


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5001))
    print(f"Starting Clinical Note Similarity Explorer on http://localhost:{port}")
    app.run(debug=True, port=port)
