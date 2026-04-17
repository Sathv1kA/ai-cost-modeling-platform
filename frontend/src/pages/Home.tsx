import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Zap, Link as LinkIcon } from "lucide-react";

const SAMPLE_REPOS = [
  { label: "openai-python examples", url: "https://github.com/openai/openai-python" },
  { label: "LangChain cookbook", url: "https://github.com/langchain-ai/langchain" },
  { label: "anthropic-sdk-python", url: "https://github.com/anthropics/anthropic-sdk-python" },
];

export default function Home() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [callsPerDay, setCallsPerDay] = useState(1000);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setError("Please enter a GitHub repository URL.");
      return;
    }
    if (!trimmed.includes("github.com/")) {
      setError("URL must be a github.com repository link.");
      return;
    }
    setError("");
    const params = new URLSearchParams({ repo: trimmed });
    if (token) params.set("token", token);
    params.set("cpd", String(callsPerDay));
    navigate(`/analysis?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
            <Zap size={14} />
            AI Cost Modeling
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Know what your LLM app<br />
            <span className="text-blue-600">really costs</span>
          </h1>
          <p className="text-slate-500 text-lg">
            Paste a GitHub repo URL. We scan for LLM calls, estimate token usage,
            and compare costs across 14+ models — instantly.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            GitHub Repository URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Analyze
            </button>
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="mt-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  GitHub Token <span className="text-slate-400 font-normal">(optional — avoids rate limits)</span>
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Daily call volume <span className="text-slate-400 font-normal">(for cost projections)</span>
                </label>
                <input
                  type="number"
                  value={callsPerDay}
                  onChange={(e) => setCallsPerDay(Number(e.target.value))}
                  min={1}
                  max={10_000_000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </form>

        {/* Sample repos */}
        <div className="mt-5">
          <p className="text-center text-sm text-slate-400 mb-2">Try a sample repo:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLE_REPOS.map((r) => (
              <button
                key={r.url}
                onClick={() => setRepoUrl(r.url)}
                className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: "🔍", label: "Detects 6+ SDKs", desc: "OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, Gemini" },
            { icon: "💰", label: "14+ Models", desc: "Compare GPT-4o, Claude, Gemini, Llama, Mistral & more" },
            { icon: "📊", label: "Cost projections", desc: "Daily & monthly estimates at any call volume" },
          ].map((f) => (
            <div key={f.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-sm font-semibold text-slate-800">{f.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
