export interface DetectedCall {
  id: string;
  file_path: string;
  line_number: number;
  sdk: string;
  model_hint: string | null;
  task_type: string;
  call_type: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  prompt_snippet: string | null;
  raw_match: string;
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

export interface CostReport {
  repo_url: string;
  files_scanned: number;
  files_with_calls: number;
  total_call_sites: number;
  detected_sdks: string[];
  calls: DetectedCall[];
  per_model_summaries: ModelCostSummary[];
  projections: ProjectedCost[];
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
