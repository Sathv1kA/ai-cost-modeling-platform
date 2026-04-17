import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Sparkles } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import type { DetectedCall, ModelCostSummary } from "../types";
import { useTheme } from "../theme/ThemeProvider";
import { fmtCost, fmtTokens } from "../utils/formatters";

const SDK_COLORS: Record<string, string> = {
  openai: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  langchain: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  llamaindex: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  cohere: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  gemini: "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const TASK_COLORS: Record<string, string> = {
  summarization: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  classification: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  rag: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  coding: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  reasoning: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  chat: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  embedding: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
};

type SortKey = "file" | "sdk" | "task" | "cost";

interface Props {
  calls: DetectedCall[];
  summaries: ModelCostSummary[];
}

function langFor(path: string): string {
  if (path.endsWith(".py") || path.endsWith(".ipynb")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "jsx";
  return "markup";
}

export default function CallBreakdown({ calls, summaries }: Props) {
  const { theme } = useTheme();
  const [sort, setSort] = useState<SortKey>("cost");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSdk, setFilterSdk] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Cheapest model cost per token rates (index 0 = cheapest after sorting)
  const cheapest = summaries[0];
  const cheapestInputRate = cheapest ? cheapest.input_price_per_mtoken / 1_000_000 : 0;
  const cheapestOutputRate = cheapest ? cheapest.output_price_per_mtoken / 1_000_000 : 0;

  const sdks = useMemo(() => Array.from(new Set(calls.map((c) => c.sdk))), [calls]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (filterSdk !== "all" && c.sdk !== filterSdk) return false;
      if (!needle) return true;
      return (
        c.file_path.toLowerCase().includes(needle) ||
        (c.model_hint?.toLowerCase().includes(needle) ?? false) ||
        c.task_type.toLowerCase().includes(needle) ||
        c.sdk.toLowerCase().includes(needle) ||
        c.raw_match.toLowerCase().includes(needle) ||
        (c.prompt_snippet?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [calls, filterSdk, search]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      if (sort === "file")
        return a.file_path.localeCompare(b.file_path) || a.line_number - b.line_number;
      if (sort === "sdk") return a.sdk.localeCompare(b.sdk);
      if (sort === "task") return a.task_type.localeCompare(b.task_type);
      // cost: cheapest model
      const ca =
        a.estimated_input_tokens * cheapestInputRate +
        a.estimated_output_tokens * cheapestOutputRate;
      const cb =
        b.estimated_input_tokens * cheapestInputRate +
        b.estimated_output_tokens * cheapestOutputRate;
      return cb - ca;
    });
    return out;
  }, [filtered, sort, cheapestInputRate, cheapestOutputRate]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSort(k)}
        className={`text-xs font-medium uppercase tracking-wide pb-2 border-b-2 transition-colors ${
          sort === k
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Call breakdown
          <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
            ({filtered.length}
            {filtered.length !== calls.length ? ` of ${calls.length}` : ""} call sites)
          </span>
        </h2>

        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search path, model, task…"
              className="text-sm pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>

          <select
            value={filterSdk}
            onChange={(e) => {
              setFilterSdk(e.target.value);
              setPage(0);
            }}
            className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All SDKs</option>
            {sdks.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {calls.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">
          No LLM call sites detected in this repository.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 pr-3 w-5"></th>
                  <th className="pb-2 pr-3"><SortBtn k="file" label="File / Line" /></th>
                  <th className="pb-2 pr-3"><SortBtn k="sdk" label="SDK" /></th>
                  <th className="pb-2 pr-3"><SortBtn k="task" label="Task" /></th>
                  <th className="pb-2 pr-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Tokens (in/out)
                  </th>
                  <th className="pb-2 text-right">
                    <SortBtn k="cost" label={`Cost (${cheapest?.display_name ?? "cheapest"})`} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((call) => {
                  const callCost =
                    call.estimated_input_tokens * cheapestInputRate +
                    call.estimated_output_tokens * cheapestOutputRate;
                  const isOpen = expanded.has(call.id);
                  return (
                    <Fragment key={call.id}>
                      <tr
                        className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                        onClick={() => toggleExpand(call.id)}
                      >
                        <td className="py-2 pr-1 text-slate-400 dark:text-slate-500">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[220px] truncate">
                            {call.file_path}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">line {call.line_number}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SDK_COLORS[call.sdk] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                            {call.sdk}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TASK_COLORS[call.task_type] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                            {call.task_type}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300">
                          {fmtTokens(call.estimated_input_tokens)} / {fmtTokens(call.estimated_output_tokens)}
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
                          {fmtCost(callCost)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50 dark:bg-slate-800/40">
                          <td colSpan={6} className="px-4 py-3 text-sm">
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                {call.model_hint && (
                                  <Detail
                                    label="Model in code"
                                    value={
                                      <code className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        {call.model_hint}
                                      </code>
                                    }
                                  />
                                )}
                                {call.resolved_model_id && (
                                  <Detail
                                    label="Resolved to"
                                    value={
                                      <code className="text-xs bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono">
                                        {call.resolved_model_id}
                                      </code>
                                    }
                                  />
                                )}
                                <Detail label="Call type" value={<span className="text-slate-700 dark:text-slate-200">{call.call_type}</span>} />
                                {call.actual_cost_usd != null && (
                                  <Detail
                                    label="Cost (declared model)"
                                    value={
                                      <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">
                                        {fmtCost(call.actual_cost_usd)}
                                      </span>
                                    }
                                  />
                                )}
                              </div>

                              {call.recommended_model_id && call.potential_savings_usd && call.potential_savings_usd > 0 && (
                                <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg text-xs">
                                  <Sparkles size={13} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                                  <div className="text-slate-700 dark:text-slate-200">
                                    Try{" "}
                                    <code className="bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-200 px-1 py-0.5 rounded font-mono">
                                      {call.recommended_model_id}
                                    </code>{" "}
                                    — saves{" "}
                                    <span className="font-semibold text-green-700 dark:text-green-300">
                                      {fmtCost(call.potential_savings_usd)}
                                    </span>{" "}
                                    per call at this estimated usage.
                                  </div>
                                </div>
                              )}

                              {call.prompt_snippet && (
                                <div>
                                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Prompt snippet:</div>
                                  <div className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                                    "{call.prompt_snippet.slice(0, 300)}"
                                  </div>
                                </div>
                              )}

                              <div>
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Matched code:</div>
                                <Highlight
                                  theme={theme === "dark" ? themes.vsDark : themes.github}
                                  code={call.raw_match}
                                  language={langFor(call.file_path)}
                                >
                                  {({ className, style, tokens, getLineProps, getTokenProps }) => (
                                    <pre
                                      className={`${className} text-xs rounded border border-slate-200 dark:border-slate-700 overflow-x-auto px-3 py-2`}
                                      style={style}
                                    >
                                      {tokens.map((line, i) => (
                                        <div key={i} {...getLineProps({ line })}>
                                          {line.map((token, j) => (
                                            <span key={j} {...getTokenProps({ token })} />
                                          ))}
                                        </div>
                                      ))}
                                    </pre>
                                  )}
                                </Highlight>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginated.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
              No calls match the current filter.
            </p>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-xs px-3 py-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="text-xs px-3 py-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}: </span>
      {value}
    </div>
  );
}
