import { useMemo, useState } from "react";
import { BarChart2, ChevronDown, ChevronUp, X } from "lucide-react";
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
import { fmtCost, fmtPercent, fmtTokens } from "../utils/formatters";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10b981",
  anthropic: "#f97316",
  google: "#3b82f6",
  groq: "#8b5cf6",
  mistral: "#ec4899",
  cohere: "#06b6d4",
};

const BAR_COLORS = {
  declared: "#94a3b8",
  selected: "#2563eb",
  benchmark: "#22c55e",
} as const;

interface Props {
  summaries: ModelCostSummary[];
  /** Sum of costs at models declared in code (when calls resolved). */
  actualTotalCostUsd: number | null;
}

function truncateLabel(s: string, max = 26): string {
  const t = s.replace(" (Groq)", "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

const DEFAULT_VISIBLE_ROWS = 10;

export default function CostTable({ summaries, actualTotalCostUsd }: Props) {
  const [view, setView] = useState<"table" | "chart">("table");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const cheapest = summaries[0];
  const hiddenCount = Math.max(0, summaries.length - DEFAULT_VISIBLE_ROWS);
  const visibleSummaries = showAll ? summaries : summaries.slice(0, DEFAULT_VISIBLE_ROWS);
  const selected = useMemo(
    () => summaries.find((s) => s.model_id === selectedId) ?? null,
    [summaries, selectedId],
  );

  const chartData = summaries.slice(0, 10).map((s) => ({
    model_id: s.model_id,
    name: s.display_name.replace(" (Groq)", ""),
    cost: s.total_cost_usd,
    provider: s.provider,
  }));

  const comparisonData = useMemo(() => {
    if (!selected || !cheapest) return [];
    const rows: { key: string; label: string; value: number; kind: keyof typeof BAR_COLORS }[] = [];
    if (actualTotalCostUsd != null && actualTotalCostUsd > 0) {
      rows.push({
        key: "declared",
        label: "Declared in code",
        value: actualTotalCostUsd,
        kind: "declared",
      });
    }
    rows.push({
      key: "whatif",
      label: `${truncateLabel(selected.display_name)} (what-if)`,
      value: selected.total_cost_usd,
      kind: "selected",
    });
    if (selected.model_id !== cheapest.model_id) {
      rows.push({
        key: "cheapest",
        label: `${truncateLabel(cheapest.display_name)} (cheapest)`,
        value: cheapest.total_cost_usd,
        kind: "benchmark",
      });
    }
    return rows;
  }, [selected, cheapest, actualTotalCostUsd]);

  function toggleSelect(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
  }

  function handleBarClick(entry: { model_id?: string } | undefined) {
    if (entry?.model_id) toggleSelect(entry.model_id);
  }

  /** Recharts Bar onClick passes BarRectangleItem with `payload` = chart row. */
  function onBarRectangleClick(item: { payload?: { model_id?: string } }) {
    handleBarClick(item.payload);
  }

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

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Each row is the estimated cost for your repo&apos;s token volume at that model&apos;s list price.
        {view === "table" ? " Click a row" : " Click a bar"} to compare against declared usage and the cheapest option.
      </p>

      {view === "table" ? (
        <div
          className={`overflow-x-auto ${
            showAll ? "max-h-[28rem] overflow-y-auto" : ""
          }`}
        >
          <table className="w-full text-sm">
            <thead className={showAll ? "sticky top-0 bg-white dark:bg-slate-900 z-10" : ""}>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium text-right">Input ($/MTok)</th>
                <th className="pb-2 font-medium text-right">Output ($/MTok)</th>
                <th className="pb-2 font-medium text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {visibleSummaries.map((s, i) => {
                const isSelected = selectedId === s.model_id;
                const isCheapest = i === 0;
                return (
                  <tr
                    key={s.model_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSelect(s.model_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect(s.model_id);
                      }
                    }}
                    className={`border-b border-slate-50 dark:border-slate-800 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                      isCheapest ? "bg-green-50 dark:bg-green-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    } ${isSelected ? "ring-2 ring-inset ring-blue-500 dark:ring-blue-400" : ""}`}
                    aria-pressed={isSelected}
                    aria-label={`${s.display_name}, total ${fmtCost(s.total_cost_usd)}. Click to compare.`}
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
                      {isCheapest && (
                        <span className="ml-1 text-xs text-green-600 dark:text-green-400 font-medium">Cheapest</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "table" && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          aria-expanded={showAll}
        >
          {showAll ? (
            <>
              <ChevronUp size={14} /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show all {summaries.length} models ({hiddenCount} more)
            </>
          )}
        </button>
      )}

      {view === "table" && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Tokens — input: {fmtTokens(summaries[0]?.total_input_tokens ?? 0)} · output:{" "}
          {fmtTokens(summaries[0]?.total_output_tokens ?? 0)}
        </p>
      )}

      {view === "chart" && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tickFormatter={(v) => fmtCost(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => fmtCost(Number(v))}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]} cursor="pointer" onClick={onBarRectangleClick}>
              {chartData.map((d) => (
                <Cell
                  key={d.model_id}
                  fill={
                    selectedId === d.model_id
                      ? "#2563eb"
                      : PROVIDER_COLORS[d.provider] ?? "#94a3b8"
                  }
                  stroke={selectedId === d.model_id ? "#1d4ed8" : undefined}
                  strokeWidth={selectedId === d.model_id ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {selected && comparisonData.length > 0 && (
        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                If you used {selected.display_name}
              </h3>
              <WhatIfNarrative
                selected={selected}
                actualTotalCostUsd={actualTotalCostUsd}
                cheapest={cheapest}
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close comparison"
            >
              <X size={18} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(140, comparisonData.length * 48)}>
            <BarChart data={comparisonData} layout="vertical" margin={{ left: 4, right: 16 }}>
              <XAxis type="number" tickFormatter={(v) => fmtCost(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v) => fmtCost(Number(v))}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Cost">
                {comparisonData.map((d) => (
                  <Cell key={d.key} fill={BAR_COLORS[d.kind]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            What-if uses the same estimated input/output tokens (including loop multipliers) as the rest of the report.
          </p>
        </div>
      )}
    </div>
  );
}

function WhatIfNarrative({
  selected,
  actualTotalCostUsd,
  cheapest,
}: {
  selected: ModelCostSummary;
  actualTotalCostUsd: number | null;
  cheapest: ModelCostSummary | undefined;
}) {
  const parts: string[] = [];
  parts.push(`At list price, all detected calls would cost ${fmtCost(selected.total_cost_usd)} on ${selected.display_name}.`);

  if (actualTotalCostUsd != null && actualTotalCostUsd > 0) {
    const ratio = (selected.total_cost_usd - actualTotalCostUsd) / actualTotalCostUsd;
    if (Math.abs(ratio) < 0.005) {
      parts.push(`That is about the same as your declared mix (${fmtCost(actualTotalCostUsd)}).`);
    } else if (ratio > 0) {
      parts.push(
        `That is about ${fmtPercent(ratio)} more than cost at models declared in code (${fmtCost(actualTotalCostUsd)}).`,
      );
    } else {
      parts.push(
        `That is about ${fmtPercent(-ratio)} less than cost at models declared in code (${fmtCost(actualTotalCostUsd)}).`,
      );
    }
  } else {
    parts.push("Declared-model total is unavailable until enough calls resolve to a catalog model.");
  }

  if (cheapest && selected.model_id !== cheapest.model_id) {
    const vsCheap = (selected.total_cost_usd - cheapest.total_cost_usd) / cheapest.total_cost_usd;
    parts.push(
      `The cheapest catalog option for this workload is ${cheapest.display_name} (${fmtCost(cheapest.total_cost_usd)}); your pick is about ${fmtPercent(vsCheap)} more expensive.`,
    );
  } else if (cheapest && selected.model_id === cheapest.model_id) {
    parts.push("This model is already the cheapest option in our catalog for this token volume.");
  }

  return <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{parts.join(" ")}</p>;
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
