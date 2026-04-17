import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { analyzeRepo } from "../api/client";
import type { CostReport, ProgressEvent } from "../types";
import SummaryCard from "../components/SummaryCard";
import CostTable from "../components/CostTable";
import CostProjection from "../components/CostProjection";
import CallBreakdown from "../components/CallBreakdown";

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
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-3" size={40} />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Analysis failed</h2>
          <p className="text-slate-500 text-sm mb-4">{errorMsg}</p>
          <Link to="/" className="text-blue-600 hover:underline text-sm">← Try another repo</Link>
        </div>
      </div>
    );
  }

  if (phase !== "done") {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <div className="text-4xl mb-4 animate-bounce">🔍</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-1">
            {phase === "scanning" ? "Scanning for LLM calls…" : "Fetching repository…"}
          </h2>
          <p className="text-slate-500 text-sm mb-4 font-mono">{repoName}</p>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: phase === "scanning" ? "90%" : `${pct}%` }}
            />
          </div>
          {progress.total > 0 && (
            <p className="text-xs text-slate-400">
              {progress.done} / {progress.total} files fetched
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{repoName}</h1>
            <p className="text-sm text-slate-500">
              {report.files_scanned} files scanned · {report.total_call_sites} LLM call sites detected
            </p>
          </div>
        </div>

        {warning && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {warning}
          </div>
        )}

        <div className="space-y-6">
          <SummaryCard report={report} />

          {report.total_call_sites === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <div className="text-5xl mb-3">🤷</div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">No LLM calls detected</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                We scanned {report.files_scanned.toLocaleString()} files but didn't find any calls
                matching the patterns for OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, or Gemini.
              </p>
              <p className="text-xs text-slate-400 mt-3">
                This repo may not use LLMs, or may use a custom wrapper we don't detect yet.
              </p>
              <Link to="/" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
                ← Try another repo
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CostTable summaries={report.per_model_summaries} />
                <CostProjection
                  summaries={report.per_model_summaries}
                  callSites={report.total_call_sites}
                  initialCallsPerDay={projCallsPerDay}
                  onCallsPerDayChange={setProjCallsPerDay}
                />
              </div>

              <CallBreakdown calls={report.calls} summaries={report.per_model_summaries} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
