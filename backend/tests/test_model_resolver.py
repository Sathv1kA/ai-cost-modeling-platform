"""
Resolver tests.

Locks in:
  - exact canonical IDs round-trip
  - curated aliases map to the expected canonical ID
  - regex family fallback catches unknown snapshot/version strings
  - every target referenced by an alias or family pattern exists in MODEL_PRICING
"""
import pytest

from models.pricing import MODEL_PRICING_MAP
from services.model_resolver import (
    ALIAS_MAP,
    FAMILY_PATTERNS,
    resolve_model_id,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Exact IDs
        ("gpt-4o", "gpt-4o"),
        ("gpt-5.4-mini", "gpt-5.4-mini"),
        ("claude-sonnet-4-6", "claude-sonnet-4-6"),
        ("claude-opus-4-7", "claude-opus-4-7"),
        ("gemini-2.5-flash", "gemini-2.5-flash"),
        ("deepseek-reasoner", "deepseek-reasoner"),
        # Aliases
        ("gpt-4o-2024-08-06", "gpt-4o"),
        ("claude-3-5-sonnet-20241022", "claude-3-5-sonnet"),
        ("gemini-1.5-pro-latest", "gemini-1.5-pro"),
        ("llama3-70b-8192", "llama-3-70b-groq"),
        ("mistral-large-latest", "mistral-large"),
        ("gpt-5", "gpt-5.4"),
        # Family fallbacks — unknown snapshot names
        ("claude-sonnet-4-6-20260301", "claude-sonnet-4-6"),
        ("claude-opus-4-7-20260401", "claude-opus-4-7"),
        ("gpt-5.4-mini-2026-03-01", "gpt-5.4-mini"),
        ("gemini-2.5-flash-preview-05-20", "gemini-2.5-flash"),
        ("o4-mini-2025-04-16", "o4-mini"),
        # Path-style IDs (Groq, OpenRouter)
        ("meta-llama/llama-4-scout-17b-16e-instruct", "llama-4-scout-groq"),
        ("openai/gpt-oss-120b", "gpt-oss-120b-groq"),
        # Case-insensitive
        ("GPT-4O", "gpt-4o"),
        ("  Claude-Sonnet-4-6  ", "claude-sonnet-4-6"),
    ],
)
def test_resolve_known(raw, expected):
    assert resolve_model_id(raw) == expected


def test_resolve_empty_returns_none():
    assert resolve_model_id(None) is None
    assert resolve_model_id("") is None
    assert resolve_model_id("   ") is None


def test_resolve_completely_unknown_returns_none():
    # Garbage input shouldn't resolve to anything.
    assert resolve_model_id("totally-made-up-model-xyz") is None


def test_all_alias_targets_exist_in_catalog():
    """Every alias must point to a real entry in MODEL_PRICING."""
    missing = [t for t in ALIAS_MAP.values() if t not in MODEL_PRICING_MAP]
    assert not missing, f"Aliases pointing to missing IDs: {missing}"


def test_all_family_targets_exist_in_catalog():
    """Every regex family fallback must point to a real entry in MODEL_PRICING."""
    missing = [t for _, t in FAMILY_PATTERNS if t not in MODEL_PRICING_MAP]
    assert not missing, f"Family targets pointing to missing IDs: {missing}"
