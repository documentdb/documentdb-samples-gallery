from datetime import datetime, timezone
from enum import Enum
from typing import Any

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class ActivityLevel(str, Enum):
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


class Activity(Document):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str
    action: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    level: ActivityLevel

    class Settings:
        name = "activities"
        indexes = [
            IndexModel(
                [("timestamp", DESCENDING), ("level", ASCENDING)],
                name="idx_timestamp_level",
            ),
            IndexModel([("user_id", ASCENDING)], name="idx_user_id"),
        ]
