import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Download, FileJson, FileText } from "lucide-react";
import type { CostReport } from "../types";
import { fetchSharedReport } from "../api/client";
import ReportView from "../components/ReportView";
import ThemeToggle from "../components/ThemeToggle";
import ShareButton from "../components/ShareButton";
import { SummarySkeleton, TableSkeleton, CallTableSkeleton } from "../components/Skeleton";
import { downloadJson, downloadMarkdown } from "../utils/exporters";

type Phase = "loading" | "done" | "error";

export default function SharedReport() {
  const { id = "" } = useParams<{ id: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [report, setReport] = useState<CostReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSharedReport(id)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setPhase("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(String(err.message ?? err));
        setPhase("error");
      });
    return () => { cancelled = true; };
  }, [id]);

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-3" size={40} />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Can't load shared report
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{errorMsg}</p>
          <Link
            to="/"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            ← Run a new analysis
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "loading" || !report) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link to="/" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Loading shared report…
              </h1>
            </div>
            <ThemeToggle />
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

  const repoName = report.repo_url.replace("https://github.com/", "");

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
                Shared report · {report.files_scanned} files · {report.total_call_sites} call sites
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareButton reportId={id} />
            {report.total_call_sites > 0 && (
              <div className="relative">
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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

        <ReportView report={report} />
      </div>
    </div>
  );
}
