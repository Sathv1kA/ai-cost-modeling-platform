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
    model_hint: Optional[str] = None
    task_type: str
    call_type: str
    estimated_input_tokens: int
    estimated_output_tokens: int
    prompt_snippet: Optional[str] = None
    raw_match: str


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


class CostReport(BaseModel):
    repo_url: str
    files_scanned: int
    files_with_calls: int
    total_call_sites: int
    detected_sdks: List[str]
    calls: List[DetectedCall]
    per_model_summaries: List[ModelCostSummary]
    projections: List[ProjectedCost]
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
