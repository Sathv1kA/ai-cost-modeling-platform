"""
GET /reports/{id} — fetch a previously-cached analysis report.
Used by the frontend /r/:id share-link route.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.cache import load_report

router = APIRouter()


@router.get("/reports/{report_id}")
def get_report(report_id: str):
    report = load_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found or expired.")
    return report
