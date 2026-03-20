import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import close_db, connect_db
from app.routes.activities import router as activities_router
from app.routes.stats import router as stats_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="Activity Log / Notification Service",
    description=(
        "Ingest high-volume activity events, query recent activities, compute "
        "statistics, and stream real-time ERROR alerts over WebSockets — "
        "all backed by DocumentDB."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(activities_router)
app.include_router(stats_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s: %s", request.method, request.url, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
