"""
Cost calculation: given detected LLM calls, compute cost across all models.
"""
from __future__ import annotations

from typing import List

from models.pricing import MODEL_PRICING, ModelPricing
from models.schemas import DetectedCall, ModelCostSummary, ProjectedCost


def _call_cost_for_model(call: DetectedCall, model: ModelPricing) -> float:
    input_cost = (call.estimated_input_tokens / 1_000_000) * model.input_price_per_mtoken
    output_cost = (call.estimated_output_tokens / 1_000_000) * model.output_price_per_mtoken
    return input_cost + output_cost


def build_model_summaries(calls: List[DetectedCall]) -> List[ModelCostSummary]:
    summaries = []
    total_input = sum(c.estimated_input_tokens for c in calls)
    total_output = sum(c.estimated_output_tokens for c in calls)
    for model in MODEL_PRICING:
        total_cost = sum(_call_cost_for_model(c, model) for c in calls)
        summaries.append(ModelCostSummary(
            model_id=model.id,
            display_name=model.display_name,
            provider=model.provider,
            quality_tier=model.quality_tier,
            total_cost_usd=round(total_cost, 6),
            total_input_tokens=total_input,
            total_output_tokens=total_output,
            input_price_per_mtoken=model.input_price_per_mtoken,
            output_price_per_mtoken=model.output_price_per_mtoken,
        ))
    # Sort cheapest first
    summaries.sort(key=lambda s: s.total_cost_usd)
    return summaries


def build_projections(
    summaries: List[ModelCostSummary],
    calls_per_day: int,
    num_call_sites: int,
) -> List[ProjectedCost]:
    if num_call_sites == 0:
        return []
    projections = []
    for s in summaries:
        per_call_avg = s.total_cost_usd / num_call_sites
        daily = per_call_avg * calls_per_day
        projections.append(ProjectedCost(
            model_id=s.model_id,
            display_name=s.display_name,
            calls_per_day=calls_per_day,
            daily_cost_usd=round(daily, 6),
            monthly_cost_usd=round(daily * 30, 4),
        ))
    return projections
