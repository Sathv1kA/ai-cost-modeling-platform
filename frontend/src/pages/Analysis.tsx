import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Download, FileJson, FileText } from "lucide-react";
import { analyzeRepo } from "../api/client";
import type { CostReport, ProgressEvent } from "../types";
import SummaryCard from "../components/SummaryCard";
import CostTable from "../components/CostTable";
import CostProjection from "../components/CostProjection";
import CallBreakdown from "../components/CallBreakdown";
import Recommendations from "../components/Recommendations";
import FileBreakdowns from "../components/FileBreakdowns";
import ThemeToggle from "../components/ThemeToggle";
import {
  SummarySkeleton,
  TableSkeleton,
  CallTableSkeleton,
} from "../components/Skeleton";
import { downloadJson, downloadMarkdown } from "../utils/exporters";

type Phase = "idle" | "fetching" | "scanning" | "done" | "error";

export default function Analysis() {
  const [params] = useSearchParams();
  const repoUrl = params.get("repo") ?? "";
  const token = params.get("token") ?? null;
  const callsPerDay = Number(params.get("cpd") ?? "1000");

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [report, setReport] = useState<CostReport | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [projCallsPerDay, setProjCallsPerDay] = useState(callsPerDay);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!repoUrl) return;
    let cancelled = false;
    setPhase("fetching");
    setProgress({ done: 0, total: 0 });

    analyzeRepo(repoUrl, token, callsPerDay, (event) => {
      if (cancelled) return;
      if (event.type === "progress") {
        const p = event as ProgressEvent;
        if (p.stage === "scanning") {
          setPhase("scanning");
        } else if (p.files_scanned !== undefined) {
          setProgress({ done: p.files_scanned, total: p.total ?? p.files_scanned });
        }
      } else if (event.type === "result") {
        setReport(event.data);
        setWarning(event.warning);
        setPhase("done");
      } else if (event.type === "error") {
        setErrorMsg(event.message);
        setPhase("error");
      }
    }).catch((err) => {
      if (cancelled) return;
      setErrorMsg(String(err));
      setPhase("error");
    });

    return () => { cancelled = true; };
  }, [repoUrl, token, callsPerDay]);

  const repoName = repoUrl.replace("https://github.com/", "");

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-3" size={40} />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Analysis failed
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{errorMsg}</p>
          <Link
            to="/"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            ← Try another repo
          </Link>
        </div>
      </div>
    );
  }

  // Loading state — show skeleton UI with progress banner
  if (phase !== "done") {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {repoName}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {phase === "scanning" ? "Scanning for LLM calls…" : "Fetching repository…"}
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Progress banner */}
          <div className="mb-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {phase === "scanning"
                  ? "Analyzing detected files for LLM calls…"
                  : progress.total > 0
                    ? `${progress.done} / ${progress.total} files fetched`
                    : "Connecting to GitHub…"}
              </span>
              {progress.total > 0 && phase !== "scanning" && (
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {pct}%
                </span>
              )}
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: phase === "scanning" ? "90%" : `${pct}%` }}
              />
            </div>
          </div>

          {/* Skeletons */}
          <div className="space-y-6">
            <SummarySkeleton />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TableSkeleton rows={6} />
              <TableSkeleton rows={6} />
            </div>
            <CallTableSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono truncate">
                {repoName}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {report.files_scanned} files scanned · {report.total_call_sites} LLM call sites detected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {report.total_call_sites > 0 && (
              <div className="relative">
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                >
                  <Download size={14} />
                  Export
                </button>
                {exportOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 overflow-hidden">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        downloadJson(report, repoName);
                        setExportOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                    >
                      <FileJson size={14} />
                      Download JSON
                    </button>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        downloadMarkdown(report, repoName);
                        setExportOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                    >
                      <FileText size={14} />
                      Download Markdown
                    </button>
                  </div>
                )}
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>

        {warning && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {warning}
          </div>
        )}

        <div className="space-y-6">
          <SummaryCard report={report} />

          {report.total_call_sites === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-10 text-center">
              <div className="text-5xl mb-3">🤷</div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
                No LLM calls detected
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                We scanned {report.files_scanned.toLocaleString()} files but didn't find any calls
                matching the patterns for OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, or Gemini.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                This repo may not use LLMs, or may use a custom wrapper we don't detect yet.
              </p>
              <Link
                to="/"
                className="inline-block mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Try another repo
              </Link>
            </div>
          ) : (
            <>
              {report.recommendations.length > 0 && (
                <Recommendations report={report} />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CostTable summaries={report.per_model_summaries} />
                <CostProjection
                  summaries={report.per_model_summaries}
                  callSites={report.total_call_sites}
                  initialCallsPerDay={projCallsPerDay}
                  onCallsPerDayChange={setProjCallsPerDay}
                />
              </div>

              {report.file_breakdowns.length > 0 && (
                <FileBreakdowns report={report} />
              )}

              <CallBreakdown calls={report.calls} summaries={report.per_model_summaries} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
