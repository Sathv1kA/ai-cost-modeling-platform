"""
Token estimation.

Primary path: tiktoken (accurate for OpenAI's cl100k_base/o200k_base encodings,
close-enough for most other models since modern LLMs have similar tokenizer density).

Fallback: char/3 for code, char/4 for prose (±30%).
"""
from __future__ import annotations

from typing import Optional

try:
    import tiktoken  # type: ignore
    _ENCODER = tiktoken.get_encoding("cl100k_base")
    _O200K_ENCODER: Optional[object]
    try:
        _O200K_ENCODER = tiktoken.get_encoding("o200k_base")
    except Exception:
        _O200K_ENCODER = None
    HAS_TIKTOKEN = True
except Exception:
    _ENCODER = None
    _O200K_ENCODER = None
    HAS_TIKTOKEN = False


# GPT-4o family uses o200k_base; most others use cl100k_base.
O200K_MODELS = {"gpt-4o", "gpt-4o-mini"}


OUTPUT_TOKEN_DEFAULTS = {
    "summarization": 300,
    "classification": 20,
    "rag": 500,
    "coding": 800,
    "reasoning": 1000,
    "chat": 400,
    "embedding": 0,
    "unknown": 300,
}

INPUT_TOKEN_DEFAULTS = {
    "summarization": 2000,
    "classification": 500,
    "rag": 4000,
    "coding": 2000,
    "reasoning": 1500,
    "chat": 800,
    "embedding": 512,
    "unknown": 1000,
}


def _pick_encoder(resolved_model_id: Optional[str]):
    if not HAS_TIKTOKEN:
        return None
    if resolved_model_id in O200K_MODELS and _O200K_ENCODER is not None:
        return _O200K_ENCODER
    return _ENCODER


def estimate_tokens(
    text: str,
    is_code: bool = False,
    resolved_model_id: Optional[str] = None,
) -> int:
    """
    Estimate token count for arbitrary text.
    Uses tiktoken when available, otherwise char-count heuristic.
    """
    if not text:
        return 0

    encoder = _pick_encoder(resolved_model_id)
    if encoder is not None:
        try:
            return len(encoder.encode(text))  # type: ignore[attr-defined]
        except Exception:
            pass  # fall through to heuristic

    chars_per_token = 3 if is_code else 4
    return max(1, len(text) // chars_per_token)


def default_input_tokens(task_type: str) -> int:
    return INPUT_TOKEN_DEFAULTS.get(task_type, INPUT_TOKEN_DEFAULTS["unknown"])


def default_output_tokens(task_type: str) -> int:
    return OUTPUT_TOKEN_DEFAULTS.get(task_type, OUTPUT_TOKEN_DEFAULTS["unknown"])
