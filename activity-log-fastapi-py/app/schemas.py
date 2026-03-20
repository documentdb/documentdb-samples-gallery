from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models import ActivityLevel


class ActivityCreate(BaseModel):
    user_id: str
    action: str
    level: ActivityLevel
    timestamp: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp", mode="after")
    @classmethod
    def require_timezone_aware(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            raise ValueError(
                "timestamp must be timezone-aware (e.g. '2025-03-20T12:34:56Z' or '2025-03-20T12:34:56+00:00')"
            )
        return v


class ActivityResponse(BaseModel):
    id: str
    timestamp: datetime
    user_id: str
    action: str
    metadata: dict[str, Any]
    level: ActivityLevel
