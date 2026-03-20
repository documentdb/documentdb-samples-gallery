import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.models import Activity, ActivityLevel
from app.schemas import ActivityCreate, ActivityResponse
from app.websocket import manager

router = APIRouter()


def _to_response(a: Activity) -> ActivityResponse:
    return ActivityResponse(
        id=str(a.id),
        timestamp=a.timestamp,
        user_id=a.user_id,
        action=a.action,
        metadata=a.metadata,
        level=a.level,
    )


@router.post("/activities", status_code=201, response_model=ActivityResponse)
async def create_activity(body: ActivityCreate) -> ActivityResponse:
    ts = body.timestamp if body.timestamp is not None else datetime.now(timezone.utc)
    activity = Activity(
        timestamp=ts,
        user_id=body.user_id,
        action=body.action,
        level=body.level,
        metadata=body.metadata,
    )
    await activity.insert()

    if activity.level == ActivityLevel.ERROR:
        alert = json.dumps(
            {
                "type": "alert",
                "level": "ERROR",
                "user_id": activity.user_id,
                "action": activity.action,
                "timestamp": activity.timestamp.isoformat(),
            }
        )
        await manager.broadcast(alert)

    return _to_response(activity)


@router.get("/activities/recent", response_model=list[ActivityResponse])
async def get_recent_activities(
    limit: int = Query(default=50, ge=1, le=500),
    user_id: Optional[str] = Query(default=None),
    level: Optional[ActivityLevel] = Query(default=None),
) -> list[ActivityResponse]:
    filters: dict = {}
    if user_id is not None:
        filters["user_id"] = user_id
    if level is not None:
        filters["level"] = level.value

    activities = (
        await Activity.find(filters).sort([("timestamp", -1)]).limit(limit).to_list()
    )
    return [_to_response(a) for a in activities]


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive; client pings are ignored.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
