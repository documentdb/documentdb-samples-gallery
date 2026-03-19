import os

from pymongo import MongoClient


def get_client() -> MongoClient:
    uri = os.getenv("DOCUMENTDB_URI")
    if not uri:
        raise SystemExit("DOCUMENTDB_URI environment variable is not set; please configure it with your MongoDB/DocumentDB connection string.")
    allow_invalid_certs = os.getenv("DOCUMENTDB_ALLOW_INVALID_CERTS", "").lower() in ("1", "true", "yes")
    if allow_invalid_certs:
        return MongoClient(uri, tlsAllowInvalidCertificates=True)
    return MongoClient(uri)


def get_collection(client: MongoClient):
    db_name = os.getenv("DOCUMENTDB_DATABASE", "clinicaldb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "notes")
    return client[db_name][col_name]
