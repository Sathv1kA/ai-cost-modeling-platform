"""
Report cache — stores analysis results in SQLite so they can be shared via
short URL (`/r/<id>`) without re-running the scan.

Schema is deliberately tiny:
  reports(id TEXT PRIMARY KEY, repo_url TEXT, payload TEXT, created_at TEXT)

Cached JSON is the full CostReport as returned by `/analyze`. The id is an
8-character urlsafe token.
"""
from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Optional

from config import settings

_LOCK = Lock()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id         TEXT PRIMARY KEY,
            repo_url   TEXT NOT NULL,
            payload    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at)")
    conn.commit()


def _connect() -> sqlite3.Connection:
    path: Path = settings.cache_db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False because FastAPI serves from multiple threads;
    # we guard writes with a module-level lock.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    _ensure_schema(conn)
    return conn


_conn = _connect()


def _new_id() -> str:
    return secrets.token_urlsafe(6)  # ~8 chars, URL-safe


def save_report(report_dict: dict, repo_url: str) -> str:
    """Persist a report and return its short id."""
    rid = _new_id()
    payload = json.dumps(report_dict, separators=(",", ":"), default=str)
    created_at = datetime.now(timezone.utc).isoformat()
    with _LOCK:
        _conn.execute(
            "INSERT INTO reports (id, repo_url, payload, created_at) VALUES (?, ?, ?, ?)",
            (rid, repo_url, payload, created_at),
        )
        _conn.commit()
    return rid


def load_report(report_id: str) -> Optional[dict]:
    """Fetch a report by id, or None if missing / expired."""
    with _LOCK:
        cur = _conn.execute(
            "SELECT payload, created_at FROM reports WHERE id = ?",
            (report_id,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    payload_str, created_at_str = row
    try:
        created_at = datetime.fromisoformat(created_at_str)
    except ValueError:
        created_at = datetime.now(timezone.utc)
    if datetime.now(timezone.utc) - created_at > timedelta(days=settings.cache_ttl_days):
        return None
    try:
        return json.loads(payload_str)
    except json.JSONDecodeError:
        return None


def purge_expired() -> int:
    """Drop rows older than TTL. Returns count deleted."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=settings.cache_ttl_days)).isoformat()
    with _LOCK:
        cur = _conn.execute("DELETE FROM reports WHERE created_at < ?", (cutoff,))
        _conn.commit()
        return cur.rowcount
