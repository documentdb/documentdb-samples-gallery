import logging

from beanie import init_beanie
from pymongo import AsyncMongoClient

from app.config import settings
from app.models import Activity

logger = logging.getLogger(__name__)

_client: AsyncMongoClient | None = None


async def connect_db() -> None:
    global _client
    # tlsAllowInvalidCertificates is only safe for the local dev container.
    # Never enable this against a real deployment — use a valid certificate instead.
    _client = AsyncMongoClient(
        settings.validated_uri(),
        tlsAllowInvalidCertificates=settings.documentdb_allow_invalid_certs,
    )
    db = _client[settings.docdb_db_name]
    await init_beanie(database=db, document_models=[Activity])
    logger.info("Beanie initialised against database '%s'.", settings.docdb_db_name)


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("DocumentDB client closed.")
