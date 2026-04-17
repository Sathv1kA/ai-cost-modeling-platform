"""
Map model strings found in code (e.g. "gpt-4o-2024-08-06", "claude-sonnet-4-6",
"gemini-2.5-flash-preview-05-20") to canonical IDs in our pricing table.

Resolution strategy:
1. Exact match against canonical ID.
2. Alias match (curated list below — covers common dated snapshots and old
   platform-specific names).
3. Regex-based family match for any major provider family (handles version
   suffixes and dated snapshots we haven't explicitly aliased).
4. Return None if unresolvable.

When we add a model to `MODEL_PRICING`, prefer that over widening the fuzzy
match — keep fuzzy as a safety net for snapshot names we can't enumerate.
"""
from __future__ import annotations

import re
from typing import Optional

from models.pricing import MODEL_PRICING_MAP


# ---------------------------------------------------------------------------
# Curated aliases. Keys are lowercased raw model strings seen in code,
# values are canonical IDs present in MODEL_PRICING.
# ---------------------------------------------------------------------------
ALIAS_MAP: dict[str, str] = {
    # ---- OpenAI snapshots ----
    "gpt-4o-2024-08-06": "gpt-4o",
    "gpt-4o-2024-05-13": "gpt-4o",
    "gpt-4o-2024-11-20": "gpt-4o",
    "chatgpt-4o-latest": "gpt-4o",
    "gpt-4o-mini-2024-07-18": "gpt-4o-mini",
    "gpt-4-turbo-2024-04-09": "gpt-4-turbo",
    "gpt-4-turbo-preview": "gpt-4-turbo",
    "gpt-4-0125-preview": "gpt-4-turbo",
    "gpt-4-1106-preview": "gpt-4-turbo",
    "gpt-3.5-turbo-0125": "gpt-3.5-turbo",
    "gpt-3.5-turbo-1106": "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k": "gpt-3.5-turbo",
    # GPT-5 platform aliases (released as plain "gpt-5" in some SDK snippets)
    "gpt-5": "gpt-5.4",
    "gpt-5-mini": "gpt-5.4-mini",
    "gpt-5-nano": "gpt-5.4-nano",
    "gpt-5-latest": "gpt-5.4",

    # ---- Anthropic snapshots & short names ----
    "claude-3-5-sonnet-20240620": "claude-3-5-sonnet",
    "claude-3-5-sonnet-20241022": "claude-3-5-sonnet",
    "claude-3-5-sonnet-latest": "claude-3-5-sonnet",
    "claude-3-5-haiku-20241022": "claude-3-5-haiku",
    "claude-3-5-haiku-latest": "claude-3-5-haiku",
    "claude-3-7-sonnet-20250219": "claude-3-7-sonnet",
    "claude-3-7-sonnet-latest": "claude-3-7-sonnet",
    "claude-3-haiku-20240307": "claude-3-haiku",
    "claude-3-opus-20240229": "claude-3-opus",
    "claude-3-opus-latest": "claude-3-opus",
    # Anthropic's 3rd-gen Sonnet is deprecated; best-effort → current Sonnet-class
    "claude-3-sonnet-20240229": "claude-3-5-sonnet",
    # Anthropic's newer tier-first naming with date suffixes
    "claude-opus-4-7-20260401": "claude-opus-4-7",
    "claude-opus-4-7-latest": "claude-opus-4-7",
    "claude-sonnet-4-6-20260301": "claude-sonnet-4-6",
    "claude-sonnet-4-6-latest": "claude-sonnet-4-6",
    "claude-haiku-4-5-20260201": "claude-haiku-4-5",
    "claude-haiku-4-5-latest": "claude-haiku-4-5",

    # ---- Google / Gemini ----
    "gemini-1.5-pro-latest": "gemini-1.5-pro",
    "gemini-1.5-pro-001": "gemini-1.5-pro",
    "gemini-1.5-pro-002": "gemini-1.5-pro",
    "gemini-1.5-flash-latest": "gemini-1.5-flash",
    "gemini-1.5-flash-001": "gemini-1.5-flash",
    "gemini-1.5-flash-002": "gemini-1.5-flash",
    "gemini-2.0-flash-001": "gemini-2.0-flash",
    "gemini-2.0-flash-exp": "gemini-2.0-flash",
    "gemini-2.5-pro-preview": "gemini-2.5-pro",
    "gemini-2.5-pro-latest": "gemini-2.5-pro",
    "gemini-2.5-flash-preview": "gemini-2.5-flash",
    "gemini-2.5-flash-latest": "gemini-2.5-flash",
    "gemini-2.5-flash-lite-preview": "gemini-2.5-flash-lite",
    "gemini-3-pro": "gemini-3.1-pro",
    "gemini-3-pro-preview": "gemini-3.1-pro",
    "gemini-3.1-pro-preview": "gemini-3.1-pro",
    "gemini-3-flash-preview": "gemini-3-flash",

    # ---- xAI / Grok ----
    "grok-4-latest": "grok-4",
    "grok-4-0709": "grok-4",
    "grok-4.20": "grok-4",
    "grok-4.20-reasoning": "grok-4",
    "grok-4.20-non-reasoning": "grok-4",
    "grok-4.1": "grok-4-fast",
    "grok-4-1-fast": "grok-4-fast",
    "grok-4-1-fast-reasoning": "grok-4-fast",
    "grok-4-1-fast-non-reasoning": "grok-4-fast",
    "grok-3-latest": "grok-3",
    "grok-3-beta": "grok-3",
    "grok-3-mini": "grok-4-fast",  # best-effort: closest budget Grok in catalog
    "grok-3-mini-beta": "grok-4-fast",

    # ---- DeepSeek ----
    "deepseek-v3": "deepseek-chat",
    "deepseek-v3.2": "deepseek-chat",
    "deepseek-r1": "deepseek-reasoner",
    "deepseek-r1-0528": "deepseek-reasoner",

    # ---- Groq / Meta Llama / Qwen / Moonshot ----
    "llama3-70b-8192": "llama-3-70b-groq",
    "llama3-8b-8192": "llama-3-8b-groq",
    "llama-3-70b-instruct": "llama-3-70b-groq",
    "llama-3-8b-instruct": "llama-3-8b-groq",
    "meta-llama/llama-3-70b-instruct": "llama-3-70b-groq",
    "meta-llama/llama-3-8b-instruct": "llama-3-8b-groq",
    "llama-3.3-70b-versatile": "llama-3.3-70b-groq",
    "llama-3.1-8b-instant": "llama-3.1-8b-groq",
    "meta-llama/llama-4-scout-17b-16e-instruct": "llama-4-scout-groq",
    "openai/gpt-oss-120b": "gpt-oss-120b-groq",
    "openai/gpt-oss-20b": "gpt-oss-20b-groq",
    "qwen/qwen3-32b": "qwen3-32b-groq",
    "moonshotai/kimi-k2-instruct": "kimi-k2-groq",
    "moonshotai/kimi-k2-instruct-0905": "kimi-k2-groq",

    # ---- Mistral ----
    "mistral-large-latest": "mistral-large",
    "mistral-large-2402": "mistral-large",
    "mistral-large-2407": "mistral-large",
    "mistral-large-2411": "mistral-large",
    "mistral-medium-latest": "mistral-medium",
    "mistral-medium-2312": "mistral-medium",
    "mistral-medium-2505": "mistral-medium",
    "mistral-small-latest": "mistral-small",
    "mistral-small-2402": "mistral-small",
    "mistral-small-2409": "mistral-small",
    "mistral-small-2501": "mistral-small",
    "mistral-small-2503": "mistral-small",
    "mistral-7b-instruct": "mistral-7b",
    "open-mistral-7b": "mistral-7b",
    "codestral-latest": "codestral",
    "codestral-2405": "codestral",
    "codestral-2501": "codestral",

    # ---- Cohere ----
    "command-a-03-2025": "command-a",
    "command-a-latest": "command-a",
    "command-r-plus-08-2024": "command-r-plus",
    "command-r-plus-04-2024": "command-r-plus",
    "command-r-plus-latest": "command-r-plus",
    "command-r-03-2024": "command-r",
    "command-r-08-2024": "command-r",
    "command-r-latest": "command-r",
    "command-r7b-12-2024": "command-r7b",
}


# ---------------------------------------------------------------------------
# Regex-based family match. Each entry is (pattern, target_model_id).
# Order matters — most specific pattern first.
#
# These handle the "we haven't seen this exact snapshot, but we know which
# family it belongs to" case. Example: an Anthropic snapshot string like
# "claude-sonnet-4-6-20260301" that isn't in ALIAS_MAP still matches the
# `claude-sonnet-4-6.*` pattern and resolves to claude-sonnet-4-6.
# ---------------------------------------------------------------------------
FAMILY_PATTERNS: list[tuple[re.Pattern, str]] = [
    # ---- OpenAI ----
    (re.compile(r"^gpt-5(\.\d+)?-?nano"), "gpt-5.4-nano"),
    (re.compile(r"^gpt-5(\.\d+)?-?mini"), "gpt-5.4-mini"),
    (re.compile(r"^gpt-5"), "gpt-5.4"),
    (re.compile(r"^gpt-4\.1-?nano"), "gpt-4.1-nano"),
    (re.compile(r"^gpt-4\.1-?mini"), "gpt-4.1-mini"),
    (re.compile(r"^gpt-4\.1"), "gpt-4.1"),
    (re.compile(r"^gpt-4o-?mini"), "gpt-4o-mini"),
    (re.compile(r"^gpt-4o"), "gpt-4o"),
    (re.compile(r"^gpt-4-turbo"), "gpt-4-turbo"),
    (re.compile(r"^gpt-4"), "gpt-4-turbo"),  # legacy bare "gpt-4"
    (re.compile(r"^gpt-3\.5"), "gpt-3.5-turbo"),
    (re.compile(r"^o4-?mini"), "o4-mini"),
    (re.compile(r"^o3-?mini"), "o3-mini"),
    (re.compile(r"^o3"), "o3"),
    (re.compile(r"^o1-?mini"), "o1-mini"),
    (re.compile(r"^o1"), "o1"),

    # ---- Anthropic ----
    # New tier-first naming (claude-<tier>-<major>-<minor>...)
    (re.compile(r"^claude-opus-4-7"), "claude-opus-4-7"),
    (re.compile(r"^claude-opus-4-6"), "claude-opus-4-6"),
    (re.compile(r"^claude-opus-4-5"), "claude-opus-4-5"),
    (re.compile(r"^claude-opus-4-1"), "claude-opus-4-1"),
    (re.compile(r"^claude-opus-4"), "claude-opus-4"),
    (re.compile(r"^claude-opus-"), "claude-opus-4-7"),  # unknown future Opus → newest
    (re.compile(r"^claude-sonnet-4-6"), "claude-sonnet-4-6"),
    (re.compile(r"^claude-sonnet-4-5"), "claude-sonnet-4-5"),
    (re.compile(r"^claude-sonnet-4"), "claude-sonnet-4"),
    (re.compile(r"^claude-sonnet-"), "claude-sonnet-4-6"),  # unknown future Sonnet → newest
    (re.compile(r"^claude-haiku-4-5"), "claude-haiku-4-5"),
    (re.compile(r"^claude-haiku-"), "claude-haiku-4-5"),
    # Legacy version-first naming (claude-<major>-<minor>-<tier>)
    (re.compile(r"^claude-3-7-sonnet"), "claude-3-7-sonnet"),
    (re.compile(r"^claude-3-5-sonnet"), "claude-3-5-sonnet"),
    (re.compile(r"^claude-3-5-haiku"), "claude-3-5-haiku"),
    (re.compile(r"^claude-3-haiku"), "claude-3-haiku"),
    (re.compile(r"^claude-3-opus"), "claude-3-opus"),
    (re.compile(r"^claude-3-sonnet"), "claude-3-5-sonnet"),
    (re.compile(r"^claude-3-5"), "claude-3-5-sonnet"),
    (re.compile(r"^claude-3"), "claude-3-5-sonnet"),

    # ---- Google / Gemini ----
    (re.compile(r"^gemini-3\.1-pro"), "gemini-3.1-pro"),
    (re.compile(r"^gemini-3.*pro"), "gemini-3.1-pro"),
    (re.compile(r"^gemini-3.*flash"), "gemini-3-flash"),
    (re.compile(r"^gemini-2\.5-pro"), "gemini-2.5-pro"),
    (re.compile(r"^gemini-2\.5-flash-lite"), "gemini-2.5-flash-lite"),
    (re.compile(r"^gemini-2\.5-flash"), "gemini-2.5-flash"),
    (re.compile(r"^gemini-2\.0-flash"), "gemini-2.0-flash"),
    (re.compile(r"^gemini-1\.5-pro"), "gemini-1.5-pro"),
    (re.compile(r"^gemini-1\.5-flash"), "gemini-1.5-flash"),
    (re.compile(r"^gemini-pro"), "gemini-1.5-pro"),  # very old name
    (re.compile(r"^gemini-flash"), "gemini-2.5-flash"),

    # ---- xAI ----
    (re.compile(r"^grok-4(\.1)?[-_]?fast"), "grok-4-fast"),
    (re.compile(r"^grok-4"), "grok-4"),
    (re.compile(r"^grok-3"), "grok-3"),
    (re.compile(r"^grok-"), "grok-4"),  # unknown Grok → newest premium

    # ---- DeepSeek ----
    (re.compile(r"^deepseek-reasoner"), "deepseek-reasoner"),
    (re.compile(r"^deepseek-r1"), "deepseek-reasoner"),
    (re.compile(r"^deepseek-chat"), "deepseek-chat"),
    (re.compile(r"^deepseek-v3"), "deepseek-chat"),
    (re.compile(r"^deepseek-"), "deepseek-chat"),

    # ---- Groq path-style IDs ----
    (re.compile(r"^meta-llama/llama-4-scout"), "llama-4-scout-groq"),
    (re.compile(r"^openai/gpt-oss-120b"), "gpt-oss-120b-groq"),
    (re.compile(r"^openai/gpt-oss-20b"), "gpt-oss-20b-groq"),
    (re.compile(r"^qwen/qwen3"), "qwen3-32b-groq"),
    (re.compile(r"^moonshotai/kimi-k2"), "kimi-k2-groq"),
    (re.compile(r"^llama-?3\.3-70b"), "llama-3.3-70b-groq"),
    (re.compile(r"^llama-?3\.1-8b"), "llama-3.1-8b-groq"),
    (re.compile(r"^llama-?3-70b"), "llama-3-70b-groq"),
    (re.compile(r"^llama-?3-8b"), "llama-3-8b-groq"),
    (re.compile(r"^llama3-70b"), "llama-3-70b-groq"),
    (re.compile(r"^llama3-8b"), "llama-3-8b-groq"),

    # ---- Mistral ----
    (re.compile(r"^codestral"), "codestral"),
    (re.compile(r"^mistral-large"), "mistral-large"),
    (re.compile(r"^mistral-medium"), "mistral-medium"),
    (re.compile(r"^mistral-small"), "mistral-small"),
    (re.compile(r"^mistral-7b"), "mistral-7b"),
    (re.compile(r"^open-mistral"), "mistral-7b"),

    # ---- Cohere ----
    (re.compile(r"^command-a"), "command-a"),
    (re.compile(r"^command-r-plus"), "command-r-plus"),
    (re.compile(r"^command-r7b"), "command-r7b"),
    (re.compile(r"^command-r"), "command-r"),
    (re.compile(r"^command-"), "command-r"),
]


def resolve_model_id(raw: Optional[str]) -> Optional[str]:
    """Given a raw model string from code, return a canonical pricing ID or None."""
    if not raw:
        return None
    key = raw.strip().lower()

    # 1. exact canonical ID
    if key in MODEL_PRICING_MAP:
        return key

    # 2. curated alias
    if key in ALIAS_MAP:
        return ALIAS_MAP[key]

    # 3. regex family match
    for pat, target in FAMILY_PATTERNS:
        if pat.match(key) and target in MODEL_PRICING_MAP:
            return target

    return None
