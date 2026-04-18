"""
POST /analyze  — main analysis endpoint (streaming NDJSON)
GET  /pricing  — return static pricing table

The analysis pipeline also saves the final report to the SQLite cache so it
can be shared via `/r/<id>` without re-running the scan.
"""
import asyncio
import json
from datetime import datetime, timezone
from typing import List

import httpx
from fastapi import APIRouter, Body, Request
from fastapi.responses import StreamingResponse

from config import settings
from models.pricing import MODEL_PRICING
from models.schemas import AnalyzeRequest, CostReport, ModelPricingOut
from services.cache import save_report
from services.cost_calculator import (
    build_file_breakdowns,
    build_model_summaries,
    build_projections,
    compute_actual_total,
    compute_recommended_total,
)
from services.detector import scan_all_files
from services.github_client import fetch_repo_files
from services.rate_limit import limiter
from services.recommender import apply_recommendations_to_calls, recommend_for_calls

router = APIRouter()


def _friendly_http_error(e: httpx.HTTPStatusError, *, has_token: bool) -> str:
    status = e.response.status_code
    if status == 404:
        # A 404 from GitHub can mean (a) the repo genuinely doesn't exist,
        # (b) the name is misspelled, or (c) the repo is private and the
        # caller isn't authenticated. GitHub intentionally returns 404
        # (not 403) for private repos so their existence isn't leaked.
        if has_token:
            return (
                "Repository not found. Check the URL — or your token may not "
                "have access to this repo."
            )
        return (
            "Repository not found. If it's private, add a GitHub token in "
            "Advanced options. Otherwise double-check the URL."
        )
    if status == 403:
        body = (e.response.text or "").lower()
        if "rate limit" in body or "api rate" in body:
            if has_token:
                return "GitHub API rate limit reached for your token. Try again later."
            return (
                "GitHub API rate limit reached. Add a GitHub token in "
                "Advanced options to raise the limit."
            )
        return "Access denied by GitHub. The repo may require authentication."
    if status == 401:
        return "GitHub token is invalid or expired. Check Advanced options."
    if status == 451:
        return "Repository is unavailable for legal reasons (DMCA or similar)."
    return f"GitHub API error {status}: {e.response.text[:200]}"


async def _stream_analysis(req: AnalyzeRequest):
    progress_queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    # If the client didn't supply a token, fall back to the server-side default
    # (settings.default_github_token). Keeps unauthenticated scans from hitting
    # rate limits immediately.
    effective_token = req.github_token or settings.default_github_token

    async def progress_cb(done: int, total: int):
        await progress_queue.put(("progress", done, total))

    async def fetch_wrapper():
        try:
            return await fetch_repo_files(
                req.repo_url, effective_token, on_progress=progress_cb
            )
        finally:
            await progress_queue.put((SENTINEL,))

    fetch_task = asyncio.create_task(fetch_wrapper())

    while True:
        item = await progress_queue.get()
        if item[0] is SENTINEL:
            break
        _, done, total = item
        yield json.dumps({"type": "progress", "files_scanned": done, "total": total}) + "\n"

    try:
        files, truncated, owner, repo = await fetch_task
    except ValueError as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        return
    except httpx.HTTPStatusError as e:
        yield json.dumps({
            "type": "error",
            "message": _friendly_http_error(e, has_token=bool(effective_token)),
        }) + "\n"
        return
    except httpx.RequestError as e:
        yield json.dumps({"type": "error", "message": f"Network error contacting GitHub: {e}"}) + "\n"
        return
    except Exception as e:
        yield json.dumps({"type": "error", "message": f"Unexpected error: {e}"}) + "\n"
        return

    yield json.dumps({"type": "progress", "stage": "scanning", "files_scanned": len(files)}) + "\n"

    try:
        calls = scan_all_files(files)
        files_with_calls = len({c.file_path for c in calls})
        detected_sdks = sorted(set(c.sdk for c in calls))

        recommendations = recommend_for_calls(calls)
        apply_recommendations_to_calls(calls, recommendations)

        summaries = build_model_summaries(calls)
        projections = build_projections(summaries, req.calls_per_day, len(calls))
        file_breakdowns = build_file_breakdowns(calls)

        actual_total, resolved_count = compute_actual_total(calls)
        recommended_total = compute_recommended_total(calls)
        potential_savings = (
            round(actual_total - recommended_total, 6)
            if (actual_total is not None and recommended_total is not None)
            else None
        )

        report = CostReport(
            repo_url=req.repo_url,
            files_scanned=len(files),
            files_with_calls=files_with_calls,
            total_call_sites=len(calls),
            detected_sdks=detected_sdks,
            calls=calls,
            per_model_summaries=summaries,
            projections=projections,
            file_breakdowns=file_breakdowns,
            recommendations=recommendations,
            actual_total_cost_usd=actual_total,
            resolved_call_count=resolved_count,
            recommended_total_cost_usd=recommended_total,
            total_potential_savings_usd=potential_savings,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as e:
        yield json.dumps({"type": "error", "message": f"Error during analysis: {e}"}) + "\n"
        return

    warning = (
        "Repository tree was truncated by GitHub API — results cover the first batch of files returned."
        if truncated
        else None
    )

    # Persist so the result can be shared via a short URL.
    report_dict = report.model_dump()
    try:
        report_id = save_report(report_dict, req.repo_url)
    except Exception:
        report_id = None  # caching is best-effort; never break the response

    yield json.dumps({
        "type": "result",
        "data": report_dict,
        "warning": warning,
        "report_id": report_id,
    }) + "\n"


@router.post("/analyze")
@limiter.limit(settings.rate_limit_analyze)
async def analyze(request: Request, req: AnalyzeRequest = Body(...)):
    # `request` must be named `request` for slowapi to pick it up.
    # `Body(...)` is required because slowapi's decorator obscures the
    # signature; without it FastAPI parses `req` as a query param.
    return StreamingResponse(
        _stream_analysis(req),
        media_type="application/x-ndjson",
    )


@router.get("/pricing", response_model=List[ModelPricingOut])
def get_pricing():
    return [
        ModelPricingOut(
            id=m.id,
            display_name=m.display_name,
            provider=m.provider,
            context_window=m.context_window,
            input_price_per_mtoken=m.input_price_per_mtoken,
            output_price_per_mtoken=m.output_price_per_mtoken,
            strengths=m.strengths,
            quality_tier=m.quality_tier,
            supports_vision=m.supports_vision,
            supports_function_calling=m.supports_function_calling,
        )
        for m in MODEL_PRICING
    ]
