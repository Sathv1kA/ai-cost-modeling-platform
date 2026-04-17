import { useMemo } from "react";
import type { ModelCostSummary } from "../types";
import { fmtCost } from "../utils/formatters";

interface Props {
  summaries: ModelCostSummary[];
  callSites: number;
  initialCallsPerDay: number;
  onCallsPerDayChange: (v: number) => void;
}

// Log-scale slider: value 0–100 maps to 1–1_000_000
function sliderToValue(s: number): number {
  return Math.round(Math.pow(10, (s / 100) * 6));
}
function valueToSlider(v: number): number {
  return Math.round((Math.log10(Math.max(1, v)) / 6) * 100);
}

export default function CostProjection({ summaries, callSites, initialCallsPerDay, onCallsPerDayChange }: Props) {
  const sliderVal = valueToSlider(initialCallsPerDay);

  const projections = useMemo(() => {
    if (callSites === 0) return [];
    return summaries.map((s) => {
      const perCall = s.total_cost_usd / callSites;
      const daily = perCall * initialCallsPerDay;
      return {
        model_id: s.model_id,
        display_name: s.display_name,
        daily,
        monthly: daily * 30,
      };
    });
  }, [summaries, callSites, initialCallsPerDay]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Cost Projection</h2>

      <div className="mb-4">
        <label className="text-sm text-slate-600 dark:text-slate-300 mb-1 block">
          Daily call volume:{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {initialCallsPerDay.toLocaleString()} calls/day
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={sliderVal}
          onChange={(e) => onCallsPerDayChange(sliderToValue(Number(e.target.value)))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          <span>1</span>
          <span>1K</span>
          <span>10K</span>
          <span>100K</span>
          <span>1M</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 font-medium text-right">Daily</th>
              <th className="pb-2 font-medium text-right">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {projections.slice(0, 8).map((p, i) => (
              <tr
                key={p.model_id}
                className={`border-b border-slate-50 dark:border-slate-800 ${i === 0 ? "bg-green-50 dark:bg-green-500/10" : ""}`}
              >
                <td className="py-1.5 text-slate-700 dark:text-slate-200 text-xs">{p.display_name}</td>
                <td className="py-1.5 text-right font-mono text-xs text-slate-900 dark:text-slate-100">{fmtCost(p.daily)}</td>
                <td className="py-1.5 text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{fmtCost(p.monthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
        Based on {callSites} detected call site{callSites !== 1 ? "s" : ""} · estimates ±30%
      </p>
    </div>
  );
}
