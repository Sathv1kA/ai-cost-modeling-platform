export interface DetectedCall {
  id: string;
  file_path: string;
  line_number: number;
  sdk: string;
  model_hint: string | null;
  resolved_model_id: string | null;
  task_type: string;
  call_type: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  actual_cost_usd: number | null;
  prompt_snippet: string | null;
  raw_match: string;
  recommended_model_id: string | null;
  recommended_cost_usd: number | null;
  potential_savings_usd: number | null;
}

export interface ModelCostSummary {
  model_id: string;
  display_name: string;
  provider: string;
  quality_tier: string;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  input_price_per_mtoken: number;
  output_price_per_mtoken: number;
}

export interface ProjectedCost {
  model_id: string;
  display_name: string;
  calls_per_day: number;
  daily_cost_usd: number;
  monthly_cost_usd: number;
}

export interface FileBreakdown {
  file_path: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  actual_cost_usd: number;
  sdks: string[];
}

export interface Recommendation {
  call_id: string;
  current_model_id: string | null;
  recommended_model_id: string;
  recommended_display_name: string;
  current_cost_usd: number | null;
  recommended_cost_usd: number;
  savings_usd: number;
  rationale: string;
}

export interface CostReport {
  repo_url: string;
  files_scanned: number;
  files_with_calls: number;
  total_call_sites: number;
  detected_sdks: string[];
  calls: DetectedCall[];
  per_model_summaries: ModelCostSummary[];
  projections: ProjectedCost[];
  file_breakdowns: FileBreakdown[];
  recommendations: Recommendation[];
  actual_total_cost_usd: number | null;
  resolved_call_count: number;
  recommended_total_cost_usd: number | null;
  total_potential_savings_usd: number | null;
  generated_at: string;
}

export type ProgressEvent = {
  type: "progress";
  files_scanned?: number;
  total?: number;
  stage?: string;
};

export type ResultEvent = {
  type: "result";
  data: CostReport;
  warning: string | null;
};

export type ErrorEvent = {
  type: "error";
  message: string;
};

export type StreamEvent = ProgressEvent | ResultEvent | ErrorEvent;
