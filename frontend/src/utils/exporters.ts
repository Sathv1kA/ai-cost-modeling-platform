import type { CostReport } from "../types";

export function downloadJson(report: CostReport, repoName: string) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `${slug(repoName)}-cost-report.json`);
}

export function downloadMarkdown(report: CostReport, repoName: string) {
  const md = buildMarkdown(report, repoName);
  const blob = new Blob([md], { type: "text/markdown" });
  triggerDownload(blob, `${slug(repoName)}-cost-report.md`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function slug(s: string) {
  return s
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function fmtCost(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.000001) return "<$0.000001";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildMarkdown(report: CostReport, repoName: string): string {
  const generated = new Date(report.generated_at).toLocaleString();
  const savingsRatio =
    report.actual_total_cost_usd != null &&
    report.total_potential_savings_usd != null &&
    report.actual_total_cost_usd > 0
      ? (report.total_potential_savings_usd / report.actual_total_cost_usd) * 100
      : null;

  const lines: string[] = [];

  lines.push(`# LLM Cost Report: ${repoName}`, "");
  lines.push(`> Generated ${generated} by **AI Cost Modeling Platform**`, "");
  lines.push(`**Repository:** ${report.repo_url}`, "");

  lines.push("## Summary", "");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Files scanned | ${report.files_scanned.toLocaleString()} |`);
  lines.push(`| Files with LLM calls | ${report.files_with_calls.toLocaleString()} |`);
  lines.push(`| LLM call sites | ${report.total_call_sites.toLocaleString()} |`);
  lines.push(
    `| Call sites resolved to known models | ${report.resolved_call_count} / ${report.total_call_sites} |`,
  );
  lines.push(
    `| Cost at declared models | ${fmtCost(report.actual_total_cost_usd)} |`,
  );
  lines.push(
    `| Cost after recommended swaps | ${fmtCost(report.recommended_total_cost_usd)} |`,
  );
  lines.push(
    `| **Potential savings** | **${fmtCost(report.total_potential_savings_usd)}${savingsRatio != null ? ` (${savingsRatio.toFixed(0)}%)` : ""}** |`,
  );
  lines.push(`| Detected SDKs | ${report.detected_sdks.join(", ") || "—"} |`);
  lines.push("");

  if (report.per_model_summaries.length > 0) {
    lines.push("## Cost Comparison Across Models", "");
    lines.push("Total cost if every detected call were routed to each model:", "");
    lines.push("| Model | Provider | Tier | Input $/MTok | Output $/MTok | Total Cost |");
    lines.push("|---|---|---|---|---|---|");
    for (const s of report.per_model_summaries) {
      lines.push(
        `| ${s.display_name} | ${s.provider} | ${s.quality_tier} | $${s.input_price_per_mtoken.toFixed(3)} | $${s.output_price_per_mtoken.toFixed(3)} | ${fmtCost(s.total_cost_usd)} |`,
      );
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommended Swaps", "");
    lines.push("| Current | → | Recommended | Current Cost | Recommended Cost | Savings |");
    lines.push("|---|---|---|---|---|---|");
    const sorted = [...report.recommendations].sort((a, b) => b.savings_usd - a.savings_usd);
    for (const r of sorted) {
      lines.push(
        `| \`${r.current_model_id ?? "unknown"}\` | → | \`${r.recommended_display_name}\` | ${fmtCost(r.current_cost_usd)} | ${fmtCost(r.recommended_cost_usd)} | **${fmtCost(r.savings_usd)}** |`,
      );
    }
    lines.push("");
  }

  if (report.file_breakdowns.length > 0) {
    lines.push("## Files with LLM Calls", "");
    lines.push("| File | Calls | Tokens (in / out) | SDKs | Cost (declared) |");
    lines.push("|---|---|---|---|---|");
    for (const fb of report.file_breakdowns) {
      lines.push(
        `| \`${fb.file_path}\` | ${fb.call_count} | ${fmtTokens(fb.total_input_tokens)} / ${fmtTokens(fb.total_output_tokens)} | ${fb.sdks.join(", ")} | ${fb.actual_cost_usd > 0 ? fmtCost(fb.actual_cost_usd) : "—"} |`,
      );
    }
    lines.push("");
  }

  if (report.calls.length > 0) {
    lines.push("## Detected Calls", "");
    lines.push("| File:Line | SDK | Task | Model in Code | Resolved | Tokens (in / out) | Cost |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const c of report.calls) {
      lines.push(
        `| \`${c.file_path}:${c.line_number}\` | ${c.sdk} | ${c.task_type} | ${c.model_hint ? `\`${c.model_hint}\`` : "—"} | ${c.resolved_model_id ? `\`${c.resolved_model_id}\`` : "—"} | ${fmtTokens(c.estimated_input_tokens)} / ${fmtTokens(c.estimated_output_tokens)} | ${fmtCost(c.actual_cost_usd)} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Token counts estimated using OpenAI's tiktoken library. Pricing from public API rate sheets — verify before making decisions.*");

  return lines.join("\n");
}
