"""
Cost calculation: given detected LLM calls, compute costs across models,
per-file aggregates, and repo-level actual/recommended totals.

All sums respect `call.call_multiplier` — a call flagged as in-loop counts
as `call_multiplier` executions (default 10).
"""
from __future__ import annotations

from typing import List, Optional

from models.pricing import MODEL_PRICING, MODEL_PRICING_MAP, ModelPricing
from models.schemas import DetectedCall, FileBreakdown, ModelCostSummary, ProjectedCost


def _effective_input(call: DetectedCall) -> int:
    return call.estimated_input_tokens * call.call_multiplier


def _effective_output(call: DetectedCall) -> int:
    return call.estimated_output_tokens * call.call_multiplier


def _call_cost_for_model(call: DetectedCall, model: ModelPricing) -> float:
    input_cost = (_effective_input(call) / 1_000_000) * model.input_price_per_mtoken
    output_cost = (_effective_output(call) / 1_000_000) * model.output_price_per_mtoken
    return input_cost + output_cost


def build_model_summaries(calls: List[DetectedCall]) -> List[ModelCostSummary]:
    summaries = []
    total_input = sum(_effective_input(c) for c in calls)
    total_output = sum(_effective_output(c) for c in calls)
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


def build_file_breakdowns(calls: List[DetectedCall]) -> List[FileBreakdown]:
    by_file: dict[str, dict] = {}
    for c in calls:
        agg = by_file.setdefault(c.file_path, {
            "count": 0,
            "input": 0,
            "output": 0,
            "cost": 0.0,
            "sdks": set(),
        })
        agg["count"] += c.call_multiplier
        agg["input"] += _effective_input(c)
        agg["output"] += _effective_output(c)
        if c.actual_cost_usd is not None:
            # actual_cost_usd already includes the multiplier at detection time
            agg["cost"] += c.actual_cost_usd
        agg["sdks"].add(c.sdk)

    breakdowns = [
        FileBreakdown(
            file_path=path,
            call_count=agg["count"],
            total_input_tokens=agg["input"],
            total_output_tokens=agg["output"],
            actual_cost_usd=round(agg["cost"], 6),
            sdks=sorted(agg["sdks"]),
        )
        for path, agg in by_file.items()
    ]
    # Most expensive file first; ties → most calls → path.
    breakdowns.sort(
        key=lambda b: (-b.actual_cost_usd, -b.call_count, b.file_path)
    )
    return breakdowns


def compute_actual_total(calls: List[DetectedCall]) -> tuple[Optional[float], int]:
    """
    Sum actual_cost_usd across calls that successfully resolved to a known model.
    Returns (total_or_None_if_no_resolved_calls, count_of_resolved_calls).
    """
    resolved = [c for c in calls if c.actual_cost_usd is not None]
    if not resolved:
        return None, 0
    return round(sum(c.actual_cost_usd or 0.0 for c in resolved), 6), len(resolved)


def compute_recommended_total(calls: List[DetectedCall]) -> Optional[float]:
    """Sum recommended_cost_usd + fall through to actual for calls with no recommendation."""
    resolved = [c for c in calls if c.actual_cost_usd is not None]
    if not resolved:
        return None
    total = 0.0
    for c in resolved:
        total += c.recommended_cost_usd if c.recommended_cost_usd is not None else (c.actual_cost_usd or 0.0)
    return round(total, 6)
