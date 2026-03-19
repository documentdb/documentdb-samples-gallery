import os

from pymongo import MongoClient


def get_client() -> MongoClient:
    uri = os.getenv("DOCUMENTDB_URI")
    if not uri:
        raise SystemExit("DOCUMENTDB_URI environment variable is not set. Please configure it to connect to DocumentDB.")

    allow_invalid_certs = os.getenv("DOCUMENTDB_ALLOW_INVALID_CERTS", "false").lower() in ("1", "true", "yes")

    if allow_invalid_certs:
        return MongoClient(uri, tlsAllowInvalidCertificates=True)

    return MongoClient(uri)


def get_collection(client: MongoClient):
    db_name = os.getenv("DOCUMENTDB_DATABASE", "contentdb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "articles")
    return client[db_name][col_name]
