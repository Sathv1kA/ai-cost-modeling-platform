import type { CostReport } from "../types";

const SDK_COLORS: Record<string, string> = {
  openai: "bg-green-100 text-green-800",
  anthropic: "bg-orange-100 text-orange-800",
  langchain: "bg-purple-100 text-purple-800",
  llamaindex: "bg-yellow-100 text-yellow-800",
  cohere: "bg-blue-100 text-blue-800",
  gemini: "bg-pink-100 text-pink-800",
  unknown: "bg-slate-100 text-slate-600",
};

function fmt(n: number): string {
  if (n < 0.0001) return "<$0.0001";
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

interface Props {
  report: CostReport;
}

export default function SummaryCard({ report }: Props) {
  const cheapest = report.per_model_summaries[0];
  const priciest = report.per_model_summaries[report.per_model_summaries.length - 1];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Summary</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Stat label="Files scanned" value={report.files_scanned.toLocaleString()} />
        <Stat label="Files with LLM calls" value={report.files_with_calls.toLocaleString()} />
        <Stat label="Call sites detected" value={report.total_call_sites.toLocaleString()} />
        <Stat
          label="Cost range (all calls)"
          value={`${fmt(cheapest?.total_cost_usd ?? 0)} – ${fmt(priciest?.total_cost_usd ?? 0)}`}
          sub="cheapest → most expensive"
        />
      </div>

      {report.detected_sdks.length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide mr-2">Detected SDKs</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-1">
            {report.detected_sdks.map((sdk) => (
              <span
                key={sdk}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${SDK_COLORS[sdk] ?? "bg-slate-100 text-slate-600"}`}
              >
                {sdk}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
