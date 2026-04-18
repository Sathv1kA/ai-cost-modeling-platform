import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Download, FileJson, FileText, Clock, KeyRound, Search, Wifi, ServerCrash, Sparkles } from "lucide-react";
import { analyzeRepo, AnalyzeError, type AnalyzeErrorKind, type AiRecommenderConfig } from "../api/client";
import type { CostReport, ProgressEvent } from "../types";

type AnalysisNavState = {
  githubToken?: string | null;
  aiRecommender?: AiRecommenderConfig | null;
};
import ReportView from "../components/ReportView";
import ShareButton from "../components/ShareButton";
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
  const location = useLocation();
  const navState = (location.state ?? null) as AnalysisNavState | null;
  const repoUrl = params.get("repo") ?? "";
  const callsPerDay = Number(params.get("cpd") ?? "1000");

  // Pull secrets from router state (set by Home.handleSubmit). Back-compat:
  // also accept `token` on the URL if that's all we have. We capture these
  // into refs on first render so they're NOT a stable dep of the analyze
  // effect — replacing history state on nav shouldn't retrigger a scan.
  const initialToken = navState?.githubToken ?? params.get("token") ?? null;
  const initialAi = navState?.aiRecommender ?? null;
  const secretsRef = useRef<{ token: string | null; ai: AiRecommenderConfig | null }>({
    token: initialToken,
    ai: initialAi,
  });
  const hasToken = !!initialToken;

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [report, setReport] = useState<CostReport | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorKind, setErrorKind] = useState<AnalyzeErrorKind>("unknown");
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!repoUrl) return;
    let cancelled = false;
    // Reset progress/state on a fresh mount or URL change. This is genuine
    // effect-driven state (we want to re-trigger the network request), so the
    // eslint `set-state-in-effect` warning is a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("fetching");
    setProgress({ done: 0, total: 0 });

    const { token, ai } = secretsRef.current;
    analyzeRepo(repoUrl, token, callsPerDay, ai, (event) => {
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
        setReportId(event.report_id ?? null);
        setPhase("done");
      } else if (event.type === "error") {
        // In-stream error (e.g. GitHub 404 after the connection was established).
        // Infer a kind from the message so the UI can hint token/URL fixes.
        const msg = event.message;
        let kind: AnalyzeErrorKind = "server";
        if (/rate limit/i.test(msg)) kind = "rate_limit";
        else if (/not found|check the url/i.test(msg)) kind = "not_found";
        else if (/token|invalid|expired|access denied/i.test(msg)) kind = "auth";
        else if (/network/i.test(msg)) kind = "network";
        setErrorMsg(msg);
        setErrorKind(kind);
        setPhase("error");
      }
    }).catch((err) => {
      if (cancelled) return;
      if (err instanceof AnalyzeError) {
        setErrorMsg(err.message);
        setErrorKind(err.kind);
        setRetryAfter(err.retryAfterSeconds);
      } else {
        setErrorMsg(String(err));
        setErrorKind("unknown");
      }
      setPhase("error");
    });

    return () => { cancelled = true; };
  }, [repoUrl, callsPerDay]);

  const repoName = repoUrl.replace("https://github.com/", "");

  if (phase === "error") {
    const ui = errorUi(errorKind, errorMsg, { retryAfter, hasToken });
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className={`mx-auto mb-3 ${ui.iconClass}`}>{ui.icon}</div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            {ui.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">{ui.body}</p>
          {ui.hint && (
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">{ui.hint}</p>
          )}
          {!ui.hint && <div className="mb-4" />}
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

  if (phase !== "done") {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
        <div className="max-w-6xl mx-auto">
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
            {reportId && <ShareButton reportId={reportId} />}
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

        {report.recommender_fallback_reason && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <Sparkles size={16} className="shrink-0 mt-0.5" />
            <span>
              <span className="font-medium">AI recommender unavailable — showing heuristic picks.</span>{" "}
              {report.recommender_fallback_reason}
            </span>
          </div>
        )}

        {report.recommender_mode === "ai" && !report.recommender_fallback_reason && (
          <div className="mb-4 flex items-start gap-2 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900/60 rounded-lg px-4 py-3 text-sm text-violet-800 dark:text-violet-200">
            <Sparkles size={16} className="shrink-0 mt-0.5" />
            <span>Recommendations generated by Claude Haiku based on your detected call shapes.</span>
          </div>
        )}

        <ReportView report={report} initialCallsPerDay={callsPerDay} />
      </div>
    </div>
  );
}

type ErrorUi = {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  body: string;
  hint?: string;
};

function errorUi(
  kind: AnalyzeErrorKind,
  rawMsg: string,
  opts: { retryAfter?: number; hasToken: boolean },
): ErrorUi {
  const red = "text-red-500";
  const amber = "text-amber-500";
  const slate = "text-slate-400";

  switch (kind) {
    case "rate_limit": {
      const wait = opts.retryAfter
        ? `Try again in about ${Math.ceil(opts.retryAfter / 60)} minute${opts.retryAfter >= 120 ? "s" : ""}.`
        : "Wait a few minutes before trying again.";
      return {
        icon: <Clock size={40} />,
        iconClass: amber,
        title: "Rate limit reached",
        body: rawMsg,
        hint: wait,
      };
    }
    case "not_found":
      return {
        icon: <Search size={40} />,
        iconClass: slate,
        title: "Repository not found",
        body: rawMsg,
        hint: opts.hasToken
          ? "Double-check the URL. Your token may not have access to this repo."
          : "Double-check the URL. If it's a private repo, add a GitHub token in Advanced options on the home page.",
      };
    case "auth":
      return {
        icon: <KeyRound size={40} />,
        iconClass: red,
        title: "Authentication problem",
        body: rawMsg,
        hint: "Verify your GitHub token has `repo` scope and hasn't expired.",
      };
    case "network":
      return {
        icon: <Wifi size={40} />,
        iconClass: red,
        title: "Can't reach the server",
        body: rawMsg,
        hint: "Check your connection, or the backend may be down.",
      };
    case "stream":
      return {
        icon: <Wifi size={40} />,
        iconClass: amber,
        title: "Connection dropped",
        body: rawMsg,
        hint: "The analysis was interrupted. Try running it again.",
      };
    case "validation":
      return {
        icon: <AlertTriangle size={40} />,
        iconClass: amber,
        title: "Invalid request",
        body: rawMsg,
      };
    case "server":
      return {
        icon: <ServerCrash size={40} />,
        iconClass: red,
        title: "Server error",
        body: rawMsg,
        hint: "Something went wrong on our end. Try again in a moment.",
      };
    default:
      return {
        icon: <AlertTriangle size={40} />,
        iconClass: red,
        title: "Analysis failed",
        body: rawMsg,
      };
  }
}
