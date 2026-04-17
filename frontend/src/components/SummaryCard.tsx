import { TrendingDown } from "lucide-react";
import type { CostReport } from "../types";
import { fmtCost, fmtPercent } from "../utils/formatters";

const SDK_COLORS: Record<string, string> = {
  openai: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  langchain: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  llamaindex: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  cohere: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  gemini: "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

interface Props {
  report: CostReport;
}

export default function SummaryCard({ report }: Props) {
  const actual = report.actual_total_cost_usd;
  const recommended = report.recommended_total_cost_usd;
  const savings = report.total_potential_savings_usd;
  const savingsRatio =
    actual != null && savings != null && actual > 0 ? savings / actual : null;
  const resolvedCoverage =
    report.total_call_sites > 0
      ? report.resolved_call_count / report.total_call_sites
      : 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Summary</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Stat label="Files scanned" value={report.files_scanned.toLocaleString()} />
        <Stat
          label="LLM call sites"
          value={report.total_call_sites.toLocaleString()}
          sub={`${report.files_with_calls} file${report.files_with_calls === 1 ? "" : "s"}`}
        />
        <Stat
          label="Cost at declared models"
          value={fmtCost(actual)}
          sub={
            report.total_call_sites > 0
              ? `${report.resolved_call_count}/${report.total_call_sites} calls resolved (${fmtPercent(resolvedCoverage)})`
              : undefined
          }
        />
        <Stat
          label="Potential savings"
          value={savings != null ? fmtCost(savings) : "—"}
          sub={
            savingsRatio != null
              ? `≈ ${fmtPercent(savingsRatio)} cheaper at recommended`
              : "Run recommender for hints"
          }
          accent="green"
          icon={<TrendingDown size={12} />}
        />
      </div>

      {/* Actual vs recommended comparison bar */}
      {actual != null && recommended != null && actual > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Actual (declared) → Recommended</span>
            <span>
              <span className="font-mono text-slate-700 dark:text-slate-200">{fmtCost(actual)}</span>
              {" → "}
              <span className="font-mono text-green-700 dark:text-green-300 font-semibold">{fmtCost(recommended)}</span>
            </span>
          </div>
          <div className="relative h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-slate-400 dark:bg-slate-600 rounded-full" style={{ width: "100%" }} />
            <div
              className="absolute inset-y-0 left-0 bg-green-500 rounded-full"
              style={{ width: `${Math.max(2, (recommended / actual) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {report.detected_sdks.length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-2">Detected SDKs</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-1">
            {report.detected_sdks.map((sdk) => (
              <span
                key={sdk}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${SDK_COLORS[sdk] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}
              >
                {sdk}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green";
  icon?: React.ReactNode;
}) {
  const valueCls =
    accent === "green"
      ? "text-green-700 dark:text-green-300"
      : "text-slate-900 dark:text-slate-50";
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
      <div className={`text-lg font-bold flex items-center gap-1 ${valueCls}`}>
        {icon}
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
