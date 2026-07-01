"""Public ad delivery endpoints for website placements."""
from __future__ import annotations

from datetime import datetime
from random import choices
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.observability import limiter
from app.db.session import SessionLocal
from app.models import AdCampaign
from app.services.storage_service import StorageService


router = APIRouter(prefix="/ads", tags=["ads"])


def ad_spent(ad: AdCampaign) -> float:
    """Estimated spend so far from the configured cost model."""
    return (int(ad.clicks or 0) * float(ad.cost_per_click or 0)) + (
        int(ad.impressions or 0) * float(ad.cost_per_impression or 0)
    )


def budget_exhausted(ad: AdCampaign) -> bool:
    return bool(ad.budget) and float(ad.budget) > 0 and ad_spent(ad) >= float(ad.budget)


def _is_live(ad: AdCampaign, now: datetime) -> bool:
    if not ad.active or ad.flagged:
        return False
    if ad.start_date and now < ad.start_date:
        return False
    if ad.end_date and now > ad.end_date:
        return False
    if budget_exhausted(ad):
        return False
    return True


def _matches_target(ad: AdCampaign, category: str | None, location: str | None) -> bool:
    """Empty targeting = matches everything; otherwise require a case-insensitive match."""
    if ad.target_category and category and ad.target_category.strip().lower() != category.strip().lower():
        return False
    if ad.target_location and location and ad.target_location.strip().lower() not in location.strip().lower():
        return False
    # If the ad targets something but the request gave no context, still allow (placement-level).
    return True


def _to_public_ad(ad: AdCampaign) -> dict[str, Any]:
    return {
        "_id": ad.id,
        "title": ad.title,
        "placement": ad.placement,
        "link": ad.link,
        "imageUrl": StorageService.resolve_public_url(ad.image_url),
        "impressions": int(ad.impressions or 0),
        "clicks": int(ad.clicks or 0),
    }


@router.get("/placements/{placement}")
async def get_ad_for_placement(
    placement: str,
    includeMetrics: bool = Query(default=False),
    category: str | None = Query(default=None),
    location: str | None = Query(default=None),
):
    """Return one live ad for a placement using lightweight weighted rotation."""
    now = datetime.utcnow()
    db: Session = SessionLocal()
    try:
        candidates = (
            db.query(AdCampaign)
            .filter(AdCampaign.placement == placement)
            .order_by(AdCampaign.created_at.desc())
            .all()
        )
        live = [e for e in candidates if _is_live(e, now) and _matches_target(e, category, location)]
        if not live:
            return {"ad": None}

        # Prefer lower-served ads but keep randomness for fair distribution.
        weights = [max(1, 1000 - int(e.impressions or 0)) for e in live]
        selected = choices(live, weights=weights, k=1)[0]

        # Atomic impression increment — avoids lost updates under concurrency.
        db.execute(
            text("UPDATE ad_campaigns SET impressions = impressions + 1, last_served_at = :now WHERE id = :id"),
            {"now": now, "id": selected.id},
        )
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
@limiter.limit("30/minute")
async def track_impression(request: Request, ad_id: str):
    db: Session = SessionLocal()
    try:
        updated = db.execute(
            text("UPDATE ad_campaigns SET impressions = impressions + 1, last_served_at = :now WHERE id = :id"),
            {"now": datetime.utcnow(), "id": ad_id},
        )
        db.commit()
        if updated.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
        return {"tracked": True, "adId": ad_id}
    finally:
        db.close()


@router.post("/{ad_id}/click")
@limiter.limit("30/minute")
async def track_click(request: Request, ad_id: str):
    db: Session = SessionLocal()
    try:
        updated = db.execute(
            text("UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = :id"),
            {"id": ad_id},
        )
        db.commit()
        if updated.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
        ad = db.query(AdCampaign).filter(AdCampaign.id == ad_id).first()
        return {"tracked": True, "adId": ad_id, "clicks": int(ad.clicks or 0) if ad else 0,
                "link": ad.link if ad else None}
    finally:
        db.close()
