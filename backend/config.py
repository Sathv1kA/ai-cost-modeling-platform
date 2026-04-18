"""
Runtime configuration — read once at import time, exposed as `settings`.

Values can be overridden via environment variables or a local `.env` file
(see `.env.example` for the full list). Defaults are tuned for local dev.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend/ directory if present (doesn't overwrite real env vars)
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)


def _csv(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [v.strip() for v in value.split(",") if v.strip()]


def _int(value: str | None, default: int) -> int:
    try:
        return int(value) if value else default
    except ValueError:
        return default


class Settings:
    # CORS — comma-separated list of origins
    cors_origins: list[str] = _csv(
        os.getenv("CORS_ORIGINS"),
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )

    # Optional server-side GitHub token used when the client doesn't supply one.
    # Keeps analyses working out of the box without leaking rate limits.
    default_github_token: str | None = os.getenv("GITHUB_TOKEN") or None

    # Rate limit for POST /analyze (per client IP)
    rate_limit_analyze: str = os.getenv("RATE_LIMIT_ANALYZE", "20/hour")

    # Cache DB path — relative to backend/ by default
    cache_db_path: Path = Path(
        os.getenv("CACHE_DB_PATH", str(BACKEND_DIR / "data" / "cache.db"))
    )

    # How long cached reports live, in days
    cache_ttl_days: int = _int(os.getenv("CACHE_TTL_DAYS"), 30)

    # Maximum number of scannable files per repo. A hard cap prevents a huge
    # monorepo from tying up the server with thousands of GitHub API calls.
    max_scannable_files: int = _int(os.getenv("MAX_SCANNABLE_FILES"), 600)


settings = Settings()
