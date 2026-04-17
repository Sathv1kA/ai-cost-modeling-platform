import { useState } from "react";
import { Link } from "react-router-dom";
import type { CostReport } from "../types";
import SummaryCard from "./SummaryCard";
import CostTable from "./CostTable";
import CostProjection from "./CostProjection";
import CallBreakdown from "./CallBreakdown";
import Recommendations from "./Recommendations";
import FileBreakdowns from "./FileBreakdowns";

interface Props {
  report: CostReport;
  initialCallsPerDay?: number;
}

export default function ReportView({ report, initialCallsPerDay = 1000 }: Props) {
  const [projCallsPerDay, setProjCallsPerDay] = useState(initialCallsPerDay);

  if (report.total_call_sites === 0) {
    return (
      <div className="space-y-6">
        <SummaryCard report={report} />
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryCard report={report} />

      {report.recommendations.length > 0 && (
        <Recommendations report={report} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CostTable
          summaries={report.per_model_summaries}
          actualTotalCostUsd={report.actual_total_cost_usd}
        />
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
    </div>
  );
}
