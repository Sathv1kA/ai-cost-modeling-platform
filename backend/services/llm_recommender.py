"""
LLM-based model recommender.

An opt-in alternative to the built-in heuristic recommender. When the user
supplies an API key, we send a single batched request to an LLM (Anthropic
Claude Haiku by default) asking it to pick the most cost-effective model
from our catalog for each unique call "shape" in the repo.

Design notes
------------
- **One request, many calls.** We deduplicate the detected calls into
  distinct shapes (task_type, call_type, has_vision, token-magnitude,
  prompt-signature) and send them all in a single prompt. A 50-call repo
  becomes one LLM request, keeping cost predictable.
- **Silent fallback.** Any failure — invalid key, network error, malformed
  response, unknown model id — is caught at the dispatcher level so the
  main analysis still returns. The frontend sees `recommender_mode =
  "heuristic"` and an explanatory `recommender_fallback_reason`.
- **Privacy.** The caller's API key is used for exactly one outbound HTTP
  request and never logged or cached.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import List, Optional

import httpx

from models.pricing import MODEL_PRICING, MODEL_PRICING_MAP, ModelPricing
from models.schemas import DetectedCall, Recommendation

log = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-haiku-4-5"   # cheap, fast, solid reasoning
ANTHROPIC_VERSION = "2023-06-01"

# Safety rails
MAX_SHAPES = 40                # don't pay to judge more than 40 unique shapes
MAX_OUTPUT_TOKENS = 2000
REQUEST_TIMEOUT = 45.0         # seconds


class RecommenderError(Exception):
    """Anything the LLM path can fail on. Caller catches and falls back."""


@dataclass(frozen=True)
class _Shape:
    """Stable identity for a group of similar calls — one LLM judgment serves all."""
    task_type: str
    call_type: str
    has_vision: bool
    token_magnitude: str   # "xs" / "s" / "m" / "l" / "xl"
    resolved_model_id: Optional[str]


def _token_magnitude(input_tokens: int, output_tokens: int) -> str:
    total = input_tokens + output_tokens
    if total < 200: return "xs"
    if total < 1000: return "s"
    if total < 5000: return "m"
    if total < 20000: return "l"
    return "xl"


def _shape_for(call: DetectedCall) -> _Shape:
    return _Shape(
        task_type=call.task_type,
        call_type=call.call_type,
        has_vision=call.has_vision,
        token_magnitude=_token_magnitude(
            call.estimated_input_tokens, call.estimated_output_tokens
        ),
        resolved_model_id=call.resolved_model_id,
    )


def _compact_pricing_table() -> list[dict]:
    """Pricing info trimmed to what matters for the decision."""
    return [
        {
            "id": m.id,
            "display_name": m.display_name,
            "provider": m.provider,
            "input_per_mtok": m.input_price_per_mtoken,
            "output_per_mtok": m.output_price_per_mtoken,
            "tier": m.quality_tier,
            "strengths": m.strengths,
            "context_window": m.context_window,
            "supports_vision": m.supports_vision,
        }
        for m in MODEL_PRICING
    ]


def _build_prompt(shapes: list[_Shape]) -> tuple[str, str]:
    """Returns (system_prompt, user_prompt)."""
    system = (
        "You are a cost-optimization expert for LLM applications. For each "
        "detected call, pick the MOST COST-EFFECTIVE model from the catalog "
        "that can still handle the task well. Cheaper is better — but never "
        "recommend a model that's too weak for the task or lacks a required "
        "capability (e.g. vision support for image calls). Respond ONLY with "
        "valid JSON matching the requested schema; no prose, no markdown."
    )

    shapes_json = [
        {
            "shape_id": i,
            "task_type": s.task_type,
            "call_type": s.call_type,
            "has_vision": s.has_vision,
            "size": s.token_magnitude,
            "currently_using": s.resolved_model_id,
        }
        for i, s in enumerate(shapes)
    ]

    user = (
        "Catalog of available models (prices are USD per 1M tokens):\n"
        f"{json.dumps(_compact_pricing_table(), indent=2)}\n\n"
        "Size legend: xs=<200 tok, s=200-1k, m=1k-5k, l=5k-20k, xl=>20k total.\n\n"
        "Call shapes detected in the repo:\n"
        f"{json.dumps(shapes_json, indent=2)}\n\n"
        "For each shape, pick one model id from the catalog and return JSON exactly like:\n"
        '{"picks": [{"shape_id": 0, "model_id": "gpt-4o-mini", "rationale": "brief reason"}, ...]}\n\n'
        "Rules:\n"
        "- model_id MUST be one of the ids listed in the catalog.\n"
        "- For vision calls (has_vision=true), only pick models with supports_vision=true.\n"
        "- Prefer budget tier unless the task clearly demands more (e.g. complex reasoning, long coding).\n"
        "- Keep rationales under 20 words each.\n"
    )
    return system, user


async def _call_anthropic(
    api_key: str,
    system_prompt: str,
    user_prompt: str,
) -> str:
    """Sends one Messages API request and returns the assistant's text."""
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(ANTHROPIC_URL, headers=headers, json=body)
    if resp.status_code == 401:
        raise RecommenderError("Anthropic API key is invalid.")
    if resp.status_code == 429:
        raise RecommenderError("Anthropic API rate limit hit; try again shortly.")
    if resp.status_code >= 400:
        # Trim body to keep logs clean — the key is never in the body.
        raise RecommenderError(
            f"Anthropic API error {resp.status_code}: {resp.text[:200]}"
        )

    data = resp.json()
    content = data.get("content") or []
    for block in content:
        if block.get("type") == "text":
            return block.get("text", "")
    raise RecommenderError("Anthropic response had no text content.")


def _parse_picks(raw: str, shape_count: int) -> dict[int, tuple[str, str]]:
    """
    Parse the assistant's text as JSON and return {shape_id: (model_id, rationale)}.
    Tolerates models that wrap JSON in ``` fences despite instructions.
    """
    text = raw.strip()
    # Strip common code-fence wrappers
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text[3:]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise RecommenderError(f"Could not parse LLM response as JSON: {e}") from e

    picks = parsed.get("picks")
    if not isinstance(picks, list):
        raise RecommenderError("LLM response missing `picks` array.")

    out: dict[int, tuple[str, str]] = {}
    for entry in picks:
        if not isinstance(entry, dict):
            continue
        sid = entry.get("shape_id")
        mid = entry.get("model_id")
        rationale = (entry.get("rationale") or "").strip() or "Selected by AI recommender."
        if not isinstance(sid, int) or not isinstance(mid, str):
            continue
        if sid < 0 or sid >= shape_count:
            continue
        if mid not in MODEL_PRICING_MAP:
            # The model hallucinated an id. Skip this shape — the caller
            # will fall back to the heuristic for any shape we couldn't fill.
            continue
        out[sid] = (mid, rationale)
    return out


def _cost_for(call: DetectedCall, model: ModelPricing) -> float:
    base = (
        (call.estimated_input_tokens / 1_000_000) * model.input_price_per_mtoken
        + (call.estimated_output_tokens / 1_000_000) * model.output_price_per_mtoken
    )
    return base * call.call_multiplier


async def recommend_with_llm(
    calls: List[DetectedCall],
    api_key: str,
    provider: str = "anthropic",
) -> List[Recommendation]:
    """
    Run the LLM recommender. Raises RecommenderError on any failure so the
    caller can fall back to the heuristic.
    """
    if not calls:
        return []
    if not api_key:
        raise RecommenderError("No API key supplied for AI recommender.")
    if provider != "anthropic":
        raise RecommenderError(f"Unsupported recommender provider: {provider!r}")

    # Deduplicate by shape
    shape_to_calls: dict[_Shape, list[DetectedCall]] = {}
    for c in calls:
        shape_to_calls.setdefault(_shape_for(c), []).append(c)

    shapes = list(shape_to_calls.keys())
    if len(shapes) > MAX_SHAPES:
        raise RecommenderError(
            f"Too many distinct call shapes ({len(shapes)}) — capped at {MAX_SHAPES}. "
            "Falling back to heuristic to keep the scan affordable."
        )

    system, user = _build_prompt(shapes)
    raw = await _call_anthropic(api_key, system, user)
    picks = _parse_picks(raw, len(shapes))

    if not picks:
        raise RecommenderError("LLM returned no usable picks.")

    recs: list[Recommendation] = []
    for idx, shape in enumerate(shapes):
        if idx not in picks:
            continue
        model_id, rationale = picks[idx]
        model = MODEL_PRICING_MAP[model_id]
        for call in shape_to_calls[shape]:
            recommended_cost = round(_cost_for(call, model), 6)
            current_cost = call.actual_cost_usd
            savings = (
                round(max(current_cost - recommended_cost, 0.0), 6)
                if current_cost is not None
                else 0.0
            )
            recs.append(Recommendation(
                call_id=call.id,
                current_model_id=call.resolved_model_id,
                recommended_model_id=model_id,
                recommended_display_name=model.display_name,
                current_cost_usd=round(current_cost, 6) if current_cost is not None else None,
                recommended_cost_usd=recommended_cost,
                savings_usd=savings,
                rationale=rationale,
                source="ai",
            ))
    return recs
