import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DetectedCall, ModelCostSummary } from "../types";

const SDK_COLORS: Record<string, string> = {
  openai: "bg-green-100 text-green-800",
  anthropic: "bg-orange-100 text-orange-800",
  langchain: "bg-purple-100 text-purple-800",
  llamaindex: "bg-yellow-100 text-yellow-800",
  cohere: "bg-blue-100 text-blue-800",
  gemini: "bg-pink-100 text-pink-800",
  unknown: "bg-slate-100 text-slate-600",
};

const TASK_COLORS: Record<string, string> = {
  summarization: "bg-teal-100 text-teal-700",
  classification: "bg-indigo-100 text-indigo-700",
  rag: "bg-amber-100 text-amber-700",
  coding: "bg-rose-100 text-rose-700",
  reasoning: "bg-violet-100 text-violet-700",
  chat: "bg-slate-100 text-slate-600",
  embedding: "bg-cyan-100 text-cyan-700",
};

function fmtCost(n: number): string {
  if (n < 0.000001) return "<$0.000001";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type SortKey = "file" | "sdk" | "task" | "cost";

interface Props {
  calls: DetectedCall[];
  summaries: ModelCostSummary[];
}

export default function CallBreakdown({ calls, summaries }: Props) {
  const [sort, setSort] = useState<SortKey>("file");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSdk, setFilterSdk] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Cheapest model cost per token rates (index 0 = cheapest after sorting)
  const cheapest = summaries[0];
  const cheapestInputRate = cheapest ? cheapest.input_price_per_mtoken / 1_000_000 : 0;
  const cheapestOutputRate = cheapest ? cheapest.output_price_per_mtoken / 1_000_000 : 0;

  const sdks = Array.from(new Set(calls.map((c) => c.sdk)));

  const filtered = filterSdk === "all" ? calls : calls.filter((c) => c.sdk === filterSdk);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "file") return a.file_path.localeCompare(b.file_path) || a.line_number - b.line_number;
    if (sort === "sdk") return a.sdk.localeCompare(b.sdk);
    if (sort === "task") return a.task_type.localeCompare(b.task_type);
    // cost: cheapest model
    const ca = a.estimated_input_tokens * cheapestInputRate + a.estimated_output_tokens * cheapestOutputRate;
    const cb = b.estimated_input_tokens * cheapestInputRate + b.estimated_output_tokens * cheapestOutputRate;
    return cb - ca;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSort(k)}
        className={`text-xs font-medium uppercase tracking-wide pb-2 border-b-2 transition-colors ${
          sort === k ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Call Breakdown
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({filtered.length} {filtered.length !== calls.length ? `of ${calls.length}` : ""} call sites)
          </span>
        </h2>

        {/* SDK filter */}
        <select
          value={filterSdk}
          onChange={(e) => { setFilterSdk(e.target.value); setPage(0); }}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All SDKs</option>
          {sdks.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {calls.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">No LLM call sites detected in this repository.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 pr-3 w-5"></th>
                  <th className="pb-2 pr-3"><SortBtn k="file" label="File / Line" /></th>
                  <th className="pb-2 pr-3"><SortBtn k="sdk" label="SDK" /></th>
                  <th className="pb-2 pr-3"><SortBtn k="task" label="Task" /></th>
                  <th className="pb-2 pr-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
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
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleExpand(call.id)}
                      >
                        <td className="py-2 pr-1 text-slate-400">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-mono text-xs text-slate-700 max-w-[200px] truncate">
                            {call.file_path}
                          </div>
                          <div className="text-xs text-slate-400">line {call.line_number}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SDK_COLORS[call.sdk] ?? "bg-slate-100 text-slate-600"}`}>
                            {call.sdk}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TASK_COLORS[call.task_type] ?? "bg-slate-100 text-slate-600"}`}>
                            {call.task_type}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs text-slate-600">
                          {fmtTokens(call.estimated_input_tokens)} / {fmtTokens(call.estimated_output_tokens)}
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-900 font-mono text-xs">
                          {fmtCost(callCost)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-4 py-3 text-sm">
                            <div className="space-y-1.5">
                              {call.model_hint && (
                                <div>
                                  <span className="text-xs font-medium text-slate-500">Model in code: </span>
                                  <code className="text-xs bg-slate-200 px-1.5 py-0.5 rounded font-mono">{call.model_hint}</code>
                                </div>
                              )}
                              <div>
                                <span className="text-xs font-medium text-slate-500">Call type: </span>
                                <span className="text-xs text-slate-700">{call.call_type}</span>
                              </div>
                              {call.prompt_snippet && (
                                <div>
                                  <span className="text-xs font-medium text-slate-500">Prompt snippet: </span>
                                  <span className="text-xs text-slate-600 italic">"{call.prompt_snippet.slice(0, 200)}"</span>
                                </div>
                              )}
                              <div>
                                <span className="text-xs font-medium text-slate-500">Matched: </span>
                                <code className="text-xs bg-slate-200 px-1.5 py-0.5 rounded font-mono break-all">{call.raw_match}</code>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-xs px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="text-xs px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
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
