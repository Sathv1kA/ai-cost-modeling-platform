from typing import List, Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    repo_url: str
    github_token: Optional[str] = None
    calls_per_day: int = 1000


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
    actual_cost_usd: Optional[float] = None   # cost at the resolved model's prices
    prompt_snippet: Optional[str] = None
    raw_match: str
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
