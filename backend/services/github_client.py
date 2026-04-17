"""
GitHub API client: fetches a repo's file tree and content.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Optional
from urllib.parse import urlparse

import httpx

from utils.file_filter import should_scan_file

GITHUB_API = "https://api.github.com"
HEADERS_BASE = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def _parse_repo_url(url: str) -> tuple[str, str, str]:
    """
    Returns (owner, repo, ref).
    Handles:
      https://github.com/owner/repo
      https://github.com/owner/repo/tree/branch
      github.com/owner/repo  (no scheme — browsers often omit it when pasting)
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("Repository URL is empty.")
    # Without a scheme, urlparse puts "github.com/..." in the path and netloc is empty.
    if not url.startswith(("http://", "https://", "//")):
        url = "https://" + url.lstrip("/")
    parsed = urlparse(url)
    if parsed.netloc and "github.com" not in parsed.netloc:
        raise ValueError(f"URL must be a github.com repository, got: {parsed.netloc}")
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(
            "URL must be in the form https://github.com/owner/repo"
        )
    owner, repo = parts[0], parts[1]
    repo = repo.removesuffix(".git")
    ref = "HEAD"
    if len(parts) >= 4 and parts[2] == "tree":
        ref = "/".join(parts[3:])
    return owner, repo, ref


def _build_headers(token: Optional[str]) -> dict:
    h = dict(HEADERS_BASE)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


async def _fetch_file_content(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    path: str,
    ref: str,
    headers: dict,
) -> tuple[str, str]:
    """Returns (path, decoded_content). Raises on error."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    resp = await client.get(url, params={"ref": ref}, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    raw = data.get("content", "")
    # GitHub wraps content in base64 with newlines
    content = base64.b64decode(raw.replace("\n", "")).decode("utf-8", errors="replace")
    return path, content


def _extract_notebook_code(content: str) -> str:
    """Extract source from code cells in a .ipynb file."""
    try:
        nb = json.loads(content)
        lines = []
        for cell in nb.get("cells", []):
            if cell.get("cell_type") == "code":
                src = cell.get("source", [])
                if isinstance(src, list):
                    lines.extend(src)
                else:
                    lines.append(src)
                lines.append("\n")
        return "".join(lines)
    except Exception:
        return content


async def fetch_repo_files(
    repo_url: str,
    token: Optional[str] = None,
    on_progress=None,  # optional async callback(files_scanned, total)
) -> list[dict]:
    """
    Returns list of {"path": str, "content": str} for all scannable files.
    Raises httpx.HTTPStatusError on API errors (404, 403, etc.).
    """
    owner, repo, ref = _parse_repo_url(repo_url)
    headers = _build_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch full recursive tree
        tree_url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{ref}"
        tree_resp = await client.get(tree_url, params={"recursive": "1"}, headers=headers)
        tree_resp.raise_for_status()
        tree_data = tree_resp.json()

        truncated = tree_data.get("truncated", False)
        items = tree_data.get("tree", [])

        # 2. Filter to scannable files
        scannable = [
            item for item in items
            if item.get("type") == "blob"
            and should_scan_file(item["path"], item.get("size", 0))
        ]

        total = len(scannable)
        results = []
        semaphore = asyncio.Semaphore(5)  # max 5 concurrent fetches

        async def fetch_one(item):
            async with semaphore:
                try:
                    path, content = await _fetch_file_content(
                        client, owner, repo, item["path"], ref, headers
                    )
                    if item["path"].endswith(".ipynb"):
                        content = _extract_notebook_code(content)
                    return {"path": path, "content": content}
                except Exception:
                    return None

        tasks = [fetch_one(item) for item in scannable]
        completed = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            completed += 1
            if result:
                results.append(result)
            if on_progress:
                await on_progress(completed, total)

    return results, truncated, owner, repo
