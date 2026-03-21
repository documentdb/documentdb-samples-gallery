from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.models import Activity

router = APIRouter()


@router.get("/activities/stats")
async def get_stats(
    window_minutes: int = Query(default=60, ge=1),
) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    collection = Activity.get_collection()

    # Run a single aggregation pass on DocumentDB using $facet to compute both
    # breakdowns (by_level and by_action) without a second round-trip.
    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {
            "$facet": {
                "by_level": [
                    {"$group": {"_id": "$level", "count": {"$sum": 1}}}
                ],
                "by_action": [
                    {"$group": {"_id": "$action", "count": {"$sum": 1}}}
                ],
            }
        },
    ]

    results = await collection.aggregate(pipeline).to_list(1)
    if not results:
        return {"window_minutes": window_minutes, "by_level": {}, "by_action": {}}

    facets = results[0]
    by_level = {item["_id"]: item["count"] for item in facets.get("by_level", [])}
    by_action = {item["_id"]: item["count"] for item in facets.get("by_action", [])}

    return {
        "window_minutes": window_minutes,
        "by_level": by_level,
        "by_action": by_action,
    }
