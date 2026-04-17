"""
Unit tests for the repo-URL parser. Keeps commit/branch pinning from regressing.
"""
from __future__ import annotations

import pytest

from services.github_client import _parse_repo_url


def test_basic():
    assert _parse_repo_url("https://github.com/owner/repo") == ("owner", "repo", "HEAD")


def test_scheme_optional_github_host():
    """Paste style without https:// must still resolve owner/repo."""
    assert _parse_repo_url("github.com/owner/repo") == ("owner", "repo", "HEAD")


def test_strips_git_suffix():
    assert _parse_repo_url("https://github.com/owner/repo.git") == ("owner", "repo", "HEAD")


def test_branch_pinning():
    assert _parse_repo_url(
        "https://github.com/owner/repo/tree/main"
    ) == ("owner", "repo", "main")


def test_sha_pinning():
    sha = "abc123def456"
    assert _parse_repo_url(
        f"https://github.com/owner/repo/tree/{sha}"
    ) == ("owner", "repo", sha)


def test_branch_with_slash():
    # e.g. `release/v1` — ref should include the rest of the path joined by /
    assert _parse_repo_url(
        "https://github.com/owner/repo/tree/release/v1"
    ) == ("owner", "repo", "release/v1")


def test_rejects_non_github():
    with pytest.raises(ValueError):
        _parse_repo_url("https://gitlab.com/owner/repo")


def test_rejects_missing_repo():
    with pytest.raises(ValueError):
        _parse_repo_url("https://github.com/owner")
