import os

from pymongo import MongoClient


def get_client() -> MongoClient:
    uri = os.environ["DOCUMENTDB_URI"]
    return MongoClient(uri, tlsAllowInvalidCertificates=True)


def get_collection(client: MongoClient):
    db_name = os.getenv("DOCUMENTDB_DATABASE", "contentdb")
    col_name = os.getenv("DOCUMENTDB_COLLECTION", "articles")
    return client[db_name][col_name]
