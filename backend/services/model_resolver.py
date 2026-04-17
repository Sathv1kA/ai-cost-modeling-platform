"""
Map model strings found in code (e.g. "gpt-4o-2024-08-06", "claude-3-5-sonnet-20240620")
to canonical IDs in our pricing table.

Resolution strategy:
1. Exact match against canonical ID.
2. Alias match (curated list below).
3. Prefix/contains fuzzy match against canonical IDs + known family markers.
4. Return None if unresolvable.
"""
from __future__ import annotations

from typing import Optional

from models.pricing import MODEL_PRICING_MAP

# Curated alias map. Keys are lowercased raw model strings found in code,
# values are canonical IDs from MODEL_PRICING.
ALIAS_MAP: dict[str, str] = {
    # OpenAI — snapshot aliases
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

    # Anthropic — snapshot aliases
    "claude-3-5-sonnet-20240620": "claude-3-5-sonnet",
    "claude-3-5-sonnet-20241022": "claude-3-5-sonnet",
    "claude-3-5-sonnet-latest": "claude-3-5-sonnet",
    "claude-3-haiku-20240307": "claude-3-haiku",
    "claude-3-opus-20240229": "claude-3-opus",
    "claude-3-opus-latest": "claude-3-opus",
    "claude-3-sonnet-20240229": "claude-3-5-sonnet",  # best-effort — old Sonnet deprecated

    # Google
    "gemini-1.5-pro-latest": "gemini-1.5-pro",
    "gemini-1.5-pro-001": "gemini-1.5-pro",
    "gemini-1.5-pro-002": "gemini-1.5-pro",
    "gemini-1.5-flash-latest": "gemini-1.5-flash",
    "gemini-1.5-flash-001": "gemini-1.5-flash",
    "gemini-1.5-flash-002": "gemini-1.5-flash",

    # Groq / Meta Llama
    "llama3-70b-8192": "llama-3-70b-groq",
    "llama3-8b-8192": "llama-3-8b-groq",
    "llama-3-70b-instruct": "llama-3-70b-groq",
    "llama-3-8b-instruct": "llama-3-8b-groq",
    "meta-llama/llama-3-70b-instruct": "llama-3-70b-groq",
    "meta-llama/llama-3-8b-instruct": "llama-3-8b-groq",

    # Mistral
    "mistral-large-latest": "mistral-large",
    "mistral-large-2402": "mistral-large",
    "mistral-7b-instruct": "mistral-7b",
    "open-mistral-7b": "mistral-7b",

    # Cohere
    "command-r-plus-08-2024": "command-r-plus",
    "command-r-plus-04-2024": "command-r-plus",
}

# Family markers for fuzzy matching. Order matters — most-specific first.
FAMILY_PREFIXES: list[tuple[str, str]] = [
    ("gpt-4o-mini", "gpt-4o-mini"),
    ("gpt-4o", "gpt-4o"),
    ("gpt-4-turbo", "gpt-4-turbo"),
    ("gpt-4", "gpt-4-turbo"),           # legacy "gpt-4" → closest tracked tier
    ("gpt-3.5", "gpt-3.5-turbo"),
    ("claude-3-5-sonnet", "claude-3-5-sonnet"),
    ("claude-3-5", "claude-3-5-sonnet"),
    ("claude-3-haiku", "claude-3-haiku"),
    ("claude-3-opus", "claude-3-opus"),
    ("claude-3-sonnet", "claude-3-5-sonnet"),
    ("gemini-1.5-pro", "gemini-1.5-pro"),
    ("gemini-1.5-flash", "gemini-1.5-flash"),
    ("llama-3-70b", "llama-3-70b-groq"),
    ("llama3-70b", "llama-3-70b-groq"),
    ("llama-3-8b", "llama-3-8b-groq"),
    ("llama3-8b", "llama-3-8b-groq"),
    ("mistral-large", "mistral-large"),
    ("mistral-7b", "mistral-7b"),
    ("open-mistral", "mistral-7b"),
    ("command-r-plus", "command-r-plus"),
    ("command-r", "command-r-plus"),
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

    # 3. fuzzy family prefix
    for prefix, target in FAMILY_PREFIXES:
        if key.startswith(prefix) or prefix in key:
            if target in MODEL_PRICING_MAP:
                return target

    return None
