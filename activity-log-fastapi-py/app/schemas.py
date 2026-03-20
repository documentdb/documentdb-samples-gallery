from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models import ActivityLevel


class ActivityCreate(BaseModel):
    user_id: str
    action: str
    level: ActivityLevel
    timestamp: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActivityResponse(BaseModel):
    id: str
    timestamp: datetime
    user_id: str
    action: str
    metadata: dict[str, Any]
    level: ActivityLevel
