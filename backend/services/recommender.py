"""
Per-call model recommender.

For each detected call, pick the cheapest model that:
  - matches or exceeds the task type in its `strengths` list (best-fit), AND
  - (if the current model is premium) offers a mid/budget tier swap with meaningful savings

The result is a list of Recommendation objects plus aggregate totals the UI can show.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

from models.pricing import MODEL_PRICING, MODEL_PRICING_MAP, ModelPricing
from models.schemas import DetectedCall, Recommendation

# Quality tier ordering (higher = stronger)
TIER_RANK = {"budget": 1, "mid": 2, "premium": 3}

# Minimum absolute savings (in USD) for the recommender to suggest a swap.
# Prevents noise from recommending a 0.0001c saving swap.
MIN_SAVINGS_USD = 0.00001

# Minimum relative savings threshold. 0.15 == recommend only if >=15% cheaper.
MIN_RELATIVE_SAVINGS = 0.15


def _cost_for(call: DetectedCall, model: ModelPricing) -> float:
    return (
        (call.estimated_input_tokens / 1_000_000) * model.input_price_per_mtoken
        + (call.estimated_output_tokens / 1_000_000) * model.output_price_per_mtoken
    )


def _pick_best_for_call(
    call: DetectedCall,
    current: Optional[ModelPricing],
) -> Tuple[Optional[ModelPricing], str]:
    """
    Pick the cheapest model whose `strengths` include the call's task_type.
    Falls back to the globally cheapest model if no strength-matching model exists.
    Returns (model, rationale) or (None, reason).
    """
    task = call.task_type

    # Candidates that explicitly list this task in their strengths.
    strength_matches = [m for m in MODEL_PRICING if task in m.strengths]

    candidates = strength_matches if strength_matches else list(MODEL_PRICING)

    # Don't downgrade to a model with zero output capacity for non-embedding tasks.
    if call.call_type != "embedding":
        candidates = [m for m in candidates if m.output_price_per_mtoken > 0]

    # Sort by estimated cost for this specific call.
    candidates.sort(key=lambda m: _cost_for(call, m))

    if not candidates:
        return None, "No suitable candidate found."

    best = candidates[0]

    if current and best.id == current.id:
        return None, f"Current model ({current.display_name}) is already the cheapest strong match for {task}."

    if strength_matches:
        rationale = (
            f"{best.display_name} lists '{task}' as a strength and is the cheapest match for this call's estimated token usage."
        )
    else:
        rationale = (
            f"No model explicitly lists '{task}' as a strength; {best.display_name} is the cheapest overall option."
        )

    return best, rationale


def recommend_for_calls(calls: List[DetectedCall]) -> List[Recommendation]:
    recs: List[Recommendation] = []
    for call in calls:
        current = (
            MODEL_PRICING_MAP.get(call.resolved_model_id) if call.resolved_model_id else None
        )
        current_cost = call.actual_cost_usd

        best, rationale = _pick_best_for_call(call, current)
        if best is None:
            continue

        recommended_cost = round(_cost_for(call, best), 6)

        # Only recommend if we have a current cost to compare against,
        # OR if no current model was resolvable (then we always suggest the best fit).
        if current_cost is not None:
            savings = current_cost - recommended_cost
            if savings < MIN_SAVINGS_USD:
                continue
            if current_cost > 0 and (savings / current_cost) < MIN_RELATIVE_SAVINGS:
                continue
        else:
            savings = 0.0  # unknown savings; still surface the fit

        recs.append(Recommendation(
            call_id=call.id,
            current_model_id=call.resolved_model_id,
            recommended_model_id=best.id,
            recommended_display_name=best.display_name,
            current_cost_usd=round(current_cost, 6) if current_cost is not None else None,
            recommended_cost_usd=recommended_cost,
            savings_usd=round(max(savings, 0.0), 6),
            rationale=rationale,
        ))
    return recs


def apply_recommendations_to_calls(
    calls: List[DetectedCall],
    recs: List[Recommendation],
) -> None:
    """Mutates each call to carry its recommendation (for easier frontend rendering)."""
    by_call = {r.call_id: r for r in recs}
    for call in calls:
        r = by_call.get(call.id)
        if r is None:
            continue
        call.recommended_model_id = r.recommended_model_id
        call.recommended_cost_usd = r.recommended_cost_usd
        call.potential_savings_usd = r.savings_usd
