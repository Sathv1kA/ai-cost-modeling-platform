import { useState } from "react";
import { BarChart2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ModelCostSummary } from "../types";
import { fmtCost, fmtTokens } from "../utils/formatters";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10b981",
  anthropic: "#f97316",
  google: "#3b82f6",
  groq: "#8b5cf6",
  mistral: "#ec4899",
  cohere: "#06b6d4",
};

interface Props {
  summaries: ModelCostSummary[];
}

export default function CostTable({ summaries }: Props) {
  const [view, setView] = useState<"table" | "chart">("table");

  const chartData = summaries.slice(0, 10).map((s) => ({
    name: s.display_name.replace(" (Groq)", ""),
    cost: s.total_cost_usd,
    provider: s.provider,
  }));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cost per Model</h2>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "table"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setView("chart")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
              view === "chart"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <BarChart2 size={12} /> Chart
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium text-right">Input ($/MTok)</th>
                <th className="pb-2 font-medium text-right">Output ($/MTok)</th>
                <th className="pb-2 font-medium text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, i) => (
                <tr
                  key={s.model_id}
                  className={`border-b border-slate-50 dark:border-slate-800 ${
                    i === 0 ? "bg-green-50 dark:bg-green-500/10" : ""
                  }`}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{s.display_name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 capitalize">{s.provider}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <TierBadge tier={s.quality_tier} />
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    ${s.input_price_per_mtoken.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    ${s.output_price_per_mtoken.toFixed(3)}
                  </td>
                  <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                    {fmtCost(s.total_cost_usd)}
                    {i === 0 && (
                      <span className="ml-1 text-xs text-green-600 dark:text-green-400 font-medium">Cheapest</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Tokens — input: {fmtTokens(summaries[0]?.total_input_tokens ?? 0)} · output:{" "}
            {fmtTokens(summaries[0]?.total_output_tokens ?? 0)}
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tickFormatter={(v) => fmtCost(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => fmtCost(Number(v))}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
              {chartData.map((d) => (
                <Cell
                  key={d.name}
                  fill={PROVIDER_COLORS[d.provider] ?? "#94a3b8"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const cls =
    tier === "premium"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
      : tier === "mid"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${cls}`}>
      {tier}
    </span>
  );
}
