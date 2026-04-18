import { useMemo, useState } from "react";
import { ArrowRight, Sparkles, TrendingDown } from "lucide-react";
import type { CostReport, DetectedCall, Recommendation } from "../types";
import { fmtCost } from "../utils/formatters";

interface Props {
  report: CostReport;
}

export default function Recommendations({ report }: Props) {
  const [showAll, setShowAll] = useState(false);
  const callsById = useMemo(() => {
    const m = new Map<string, DetectedCall>();
    for (const c of report.calls) m.set(c.id, c);
    return m;
  }, [report.calls]);

  const sorted = useMemo(
    () => [...report.recommendations].sort((a, b) => b.savings_usd - a.savings_usd),
    [report.recommendations],
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-green-500" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recommendations</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No swap recommendations — either you're already using the cheapest suitable model for each
          task, or we couldn't resolve the declared models.
        </p>
      </div>
    );
  }

  const displayed = showAll ? sorted : sorted.slice(0, 8);
  const totalSavings = report.total_potential_savings_usd ?? 0;
  const isAi = report.recommender_mode === "ai";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className={isAi ? "text-violet-500" : "text-green-500"} />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Swap recommendations
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({sorted.length} {sorted.length === 1 ? "opportunity" : "opportunities"})
            </span>
          </h2>
          {isAi && (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <Sparkles size={10} />
              AI
            </span>
          )}
        </div>
        {totalSavings > 0 && (
          <div className="flex items-center gap-1 text-sm font-semibold text-green-600 dark:text-green-400">
            <TrendingDown size={14} />
            Save {fmtCost(totalSavings)} total
          </div>
        )}
      </div>

      <div className="space-y-2">
        {displayed.map((r) => (
          <Row key={r.call_id} rec={r} call={callsById.get(r.call_id)} />
        ))}
      </div>

      {sorted.length > 8 && (
        <button
          className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setShowAll((x) => !x)}
        >
          {showAll ? "Show fewer" : `Show all ${sorted.length} recommendations`}
        </button>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
        Recommendations match by task type strengths. Always validate quality before switching.
      </p>
    </div>
  );
}

function Row({ rec, call }: { rec: Recommendation; call?: DetectedCall }) {
  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {call && (
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
            {call.file_path}:{call.line_number}
          </span>
        )}
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {rec.current_model_id ?? "unknown"}
          </code>
          <ArrowRight size={12} className="text-slate-400" />
          <code className="text-xs bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded font-medium">
            {rec.recommended_display_name}
          </code>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
          {rec.current_cost_usd != null ? fmtCost(rec.current_cost_usd) : "—"}{" "}
          →{" "}
          <span className="text-green-700 dark:text-green-400 font-semibold">
            {fmtCost(rec.recommended_cost_usd)}
          </span>
          {rec.savings_usd > 0 && (
            <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">
              (−{fmtCost(rec.savings_usd)})
            </span>
          )}
        </span>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{rec.rationale}</p>
    </div>
  );
}
