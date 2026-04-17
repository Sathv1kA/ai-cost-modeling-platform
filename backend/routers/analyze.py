"""
POST /analyze  — main analysis endpoint (streaming NDJSON)
GET  /pricing  — return static pricing table
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import List

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.pricing import MODEL_PRICING
from models.schemas import AnalyzeRequest, CostReport, ModelPricingOut
from services.cost_calculator import build_model_summaries, build_projections
from services.detector import scan_all_files
from services.github_client import fetch_repo_files

router = APIRouter()


def _friendly_http_error(e: httpx.HTTPStatusError) -> str:
    status = e.response.status_code
    if status == 404:
        return "Repository not found. Check the URL or make sure the repo is public."
    if status == 403:
        return (
            "GitHub API rate limit reached or access denied. "
            "Try providing a personal access token in the Advanced options."
        )
    if status == 401:
        return "GitHub token is invalid or expired."
    return f"GitHub API error {status}: {e.response.text[:200]}"


async def _stream_analysis(req: AnalyzeRequest):
    progress_queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    async def progress_cb(done: int, total: int):
        await progress_queue.put(("progress", done, total))

    async def fetch_wrapper():
        try:
            return await fetch_repo_files(
                req.repo_url, req.github_token, on_progress=progress_cb
            )
        finally:
            # Always signal completion so the streaming loop can exit cleanly
            await progress_queue.put((SENTINEL,))

    fetch_task = asyncio.create_task(fetch_wrapper())

    # Drain queue with proper blocking (no busy-loop, no race conditions)
    while True:
        item = await progress_queue.get()
        if item[0] is SENTINEL:
            break
        _, done, total = item
        yield json.dumps({"type": "progress", "files_scanned": done, "total": total}) + "\n"

    # At this point fetch_task is done (or will be momentarily)
    try:
        files, truncated, owner, repo = await fetch_task
    except ValueError as e:
        # URL parse errors
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        return
    except httpx.HTTPStatusError as e:
        yield json.dumps({"type": "error", "message": _friendly_http_error(e)}) + "\n"
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

        summaries = build_model_summaries(calls)
        projections = build_projections(summaries, req.calls_per_day, len(calls))

        report = CostReport(
            repo_url=req.repo_url,
            files_scanned=len(files),
            files_with_calls=files_with_calls,
            total_call_sites=len(calls),
            detected_sdks=detected_sdks,
            calls=calls,
            per_model_summaries=summaries,
            projections=projections,
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

    yield json.dumps({
        "type": "result",
        "data": report.model_dump(),
        "warning": warning,
    }) + "\n"


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
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
