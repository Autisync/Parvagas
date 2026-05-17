"""Public ad delivery endpoints for website placements."""
from __future__ import annotations

from datetime import datetime
from random import choices
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import AdCampaign


router = APIRouter(prefix="/ads", tags=["ads"])


def _is_live(ad: AdCampaign, now: datetime) -> bool:
    if not ad.active:
        return False
    if ad.flagged:
        return False
    if ad.start_date and now < ad.start_date:
        return False
    if ad.end_date and now > ad.end_date:
        return False
    return True


def _to_public_ad(ad: AdCampaign) -> dict[str, Any]:
    return {
        "_id": ad.id,
        "title": ad.title,
        "placement": ad.placement,
        "link": ad.link,
        "imageUrl": ad.image_url,
        "impressions": int(ad.impressions or 0),
        "clicks": int(ad.clicks or 0),
    }


@router.get("/placements/{placement}")
async def get_ad_for_placement(
    placement: str,
    includeMetrics: bool = Query(default=False),
):
    """Return one active ad for a placement using lightweight weighted rotation."""
    now = datetime.utcnow()
    db: Session = SessionLocal()
    try:
        candidates = (
            db.query(AdCampaign)
            .filter(AdCampaign.placement == placement)
            .order_by(AdCampaign.created_at.desc())
            .all()
        )
        live = [entry for entry in candidates if _is_live(entry, now)]
        if not live:
            return {"ad": None}

        # Prefer lower-served ads but keep randomness for fair distribution.
        weights = [max(1, 1000 - int(entry.impressions or 0)) for entry in live]
        selected = choices(live, weights=weights, k=1)[0]
        selected.impressions = int(selected.impressions or 0) + 1
        selected.last_served_at = now
        db.commit()
        db.refresh(selected)

        ad_payload = _to_public_ad(selected)
        if not includeMetrics:
            ad_payload.pop("impressions", None)
            ad_payload.pop("clicks", None)
        return {"ad": ad_payload}
    finally:
        db.close()


@router.post("/{ad_id}/impression")
async def track_impression(ad_id: str):
    db: Session = SessionLocal()
    try:
        ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
        if not ad:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
        ad.impressions = int(ad.impressions or 0) + 1
        ad.last_served_at = datetime.utcnow()
        db.commit()
        return {"tracked": True, "adId": ad.id, "impressions": int(ad.impressions or 0)}
    finally:
        db.close()


@router.post("/{ad_id}/click")
async def track_click(ad_id: str):
    db: Session = SessionLocal()
    try:
        ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
        if not ad:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
        ad.clicks = int(ad.clicks or 0) + 1
        db.commit()
        return {
            "tracked": True,
            "adId": ad.id,
            "clicks": int(ad.clicks or 0),
            "link": ad.link,
        }
    finally:
        db.close()
