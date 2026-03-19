import os

from pymongo import MongoClient


def get_client() -> MongoClient:
    uri = os.environ["DOCUMENTDB_URI"]
    return MongoClient(uri, tlsAllowInvalidCertificates=True)


def get_collection(client: MongoClient):
    db_name = os.getenv("DOCUMENTDB_DATABASE", "clinicaldb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "notes")
    return client[db_name][col_name]
