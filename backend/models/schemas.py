from typing import List, Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    repo_url: str
    github_token: Optional[str] = None
    calls_per_day: int = 1000
    # Optional: use a real LLM to judge which model is best for each call.
    # Requires an API key. Falls back to the built-in heuristic on any error
    # so an invalid key or network blip doesn't break the analysis.
    use_ai_recommender: bool = False
    recommender_provider: str = "anthropic"   # "anthropic" is the only one for now
    recommender_api_key: Optional[str] = None


class DetectedCall(BaseModel):
    id: str
    file_path: str
    line_number: int
    sdk: str
    model_hint: Optional[str] = None          # raw string from code (e.g. "gpt-4o-2024-08-06")
    resolved_model_id: Optional[str] = None   # canonical ID from pricing table, if we could match
    task_type: str
    call_type: str
    estimated_input_tokens: int
    estimated_output_tokens: int
    actual_cost_usd: Optional[float] = None   # cost at the resolved model's prices (already × multiplier)
    prompt_snippet: Optional[str] = None
    raw_match: str
    # Extraction signals from the smarter detector:
    in_loop: bool = False                     # call appears inside a for/while/.map/.forEach
    call_multiplier: int = 1                  # estimated executions — 1 if not in loop, default 10 if in loop
    has_vision: bool = False                  # call includes image content → token counts bumped
    max_output_tokens: Optional[int] = None   # extracted from code; output tokens capped at this
    detection_method: str = "regex"           # "ast" for Python AST path, "regex" for JS/TS/notebooks
    # Recommender output (filled in after initial detection):
    recommended_model_id: Optional[str] = None
    recommended_cost_usd: Optional[float] = None
    potential_savings_usd: Optional[float] = None


class ModelCostSummary(BaseModel):
    model_id: str
    display_name: str
    provider: str
    quality_tier: str
    total_cost_usd: float
    total_input_tokens: int
    total_output_tokens: int
    input_price_per_mtoken: float
    output_price_per_mtoken: float


class ProjectedCost(BaseModel):
    model_id: str
    display_name: str
    calls_per_day: int
    daily_cost_usd: float
    monthly_cost_usd: float


class FileBreakdown(BaseModel):
    file_path: str
    call_count: int
    total_input_tokens: int
    total_output_tokens: int
    actual_cost_usd: float
    sdks: List[str]


class Recommendation(BaseModel):
    call_id: str
    current_model_id: Optional[str]
    recommended_model_id: str
    recommended_display_name: str
    current_cost_usd: Optional[float]
    recommended_cost_usd: float
    savings_usd: float
    rationale: str
    # Which engine produced this recommendation: "heuristic" (default, built-in
    # strength/cost scoring) or "ai" (LLM-judged when the user supplies a key).
    source: str = "heuristic"


class CostReport(BaseModel):
    repo_url: str
    files_scanned: int
    files_with_calls: int
    total_call_sites: int
    detected_sdks: List[str]
    calls: List[DetectedCall]
    per_model_summaries: List[ModelCostSummary]
    projections: List[ProjectedCost]
    file_breakdowns: List[FileBreakdown]
    recommendations: List[Recommendation]
    actual_total_cost_usd: Optional[float] = None   # sum of resolvable calls at their declared model
    resolved_call_count: int = 0
    recommended_total_cost_usd: Optional[float] = None
    total_potential_savings_usd: Optional[float] = None
    # Which engine produced the per-call recommendations. "ai" if the LLM
    # recommender ran successfully, else "heuristic".
    recommender_mode: str = "heuristic"
    # Populated when AI was requested but failed for some reason, so the UI
    # can show a small banner ("AI failed, fell back to heuristic: ...").
    recommender_fallback_reason: Optional[str] = None
    generated_at: str


class ModelPricingOut(BaseModel):
    id: str
    display_name: str
    provider: str
    context_window: int
    input_price_per_mtoken: float
    output_price_per_mtoken: float
    strengths: List[str]
    quality_tier: str
    supports_vision: bool
    supports_function_calling: bool
