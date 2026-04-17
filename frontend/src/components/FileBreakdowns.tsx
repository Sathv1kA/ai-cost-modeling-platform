import { Fragment, useState } from "react";
import { FileCode } from "lucide-react";
import type { CostReport, FileBreakdown, DetectedCall } from "../types";
import { fmtCost, fmtTokens } from "../utils/formatters";

interface Props {
  report: CostReport;
}

export default function FileBreakdowns({ report }: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = report.file_breakdowns.filter((f) =>
    f.file_path.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const callsByFile = new Map<string, DetectedCall[]>();
  for (const c of report.calls) {
    if (!callsByFile.has(c.file_path)) callsByFile.set(c.file_path, []);
    callsByFile.get(c.file_path)!.push(c);
  }

  if (report.file_breakdowns.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <FileCode size={16} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Files with LLM calls
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({filtered.length} {filtered.length === report.file_breakdowns.length ? "" : `of ${report.file_breakdowns.length}`})
            </span>
          </h2>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter file path…"
          className="text-sm px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
              <th className="pb-2 pr-3 font-medium">File</th>
              <th className="pb-2 pr-3 font-medium text-right">Calls</th>
              <th className="pb-2 pr-3 font-medium text-right">Tokens</th>
              <th className="pb-2 pr-3 font-medium">SDKs</th>
              <th className="pb-2 font-medium text-right">Cost (declared)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((fb) => {
              const isOpen = expanded === fb.file_path;
              return (
                <Fragment key={fb.file_path}>
                  <tr
                    className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : fb.file_path)}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">
                        {fb.file_path}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-200 font-mono text-xs">
                      {fb.call_count}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {fmtTokens(fb.total_input_tokens)}/{fmtTokens(fb.total_output_tokens)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {fb.sdks.map((s) => (
                          <span
                            key={s}
                            className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
                      {fb.actual_cost_usd > 0 ? fmtCost(fb.actual_cost_usd) : "—"}
                    </td>
                  </tr>
                  {isOpen && <ExpandedCalls calls={callsByFile.get(fb.file_path) ?? []} fb={fb} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && search && (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
          No files match "{search}".
        </p>
      )}
    </div>
  );
}

function ExpandedCalls({ calls, fb }: { calls: DetectedCall[]; fb: FileBreakdown }) {
  return (
    <tr className="bg-slate-50 dark:bg-slate-800/40">
      <td colSpan={5} className="px-4 py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          {calls.length} call{calls.length === 1 ? "" : "s"} in{" "}
          <span className="font-mono">{fb.file_path}</span>:
        </p>
        <ul className="space-y-1 text-xs font-mono text-slate-700 dark:text-slate-200">
          {calls.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="text-slate-400">line {c.line_number}</span>
              <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded">{c.sdk}</span>
              {c.model_hint && (
                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 rounded">
                  {c.model_hint}
                </span>
              )}
              <span className="text-slate-500 dark:text-slate-400 truncate">{c.raw_match}</span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}
