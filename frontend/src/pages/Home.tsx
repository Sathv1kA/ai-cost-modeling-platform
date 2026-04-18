import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Zap, Link as LinkIcon, Sparkles } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

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
  const [useAi, setUseAi] = useState(false);
  const [aiKey, setAiKey] = useState("");
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
    if (useAi && !aiKey.trim()) {
      setError("Provide an Anthropic API key, or turn off AI recommender.");
      return;
    }
    setError("");
    // URL holds only non-sensitive params so the query string stays shareable
    // without leaking secrets. Tokens and API keys ride along via router state
    // (in-memory only, not written to browser history or referer headers).
    const params = new URLSearchParams({ repo: trimmed, cpd: String(callsPerDay) });
    navigate(`/analysis?${params.toString()}`, {
      state: {
        githubToken: token || null,
        aiRecommender: useAi
          ? { provider: "anthropic" as const, apiKey: aiKey.trim() }
          : null,
      },
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center px-4 py-16 relative">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-2xl w-full">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium px-3 py-1 rounded-full mb-4">
            <Zap size={14} />
            AI Cost Modeling
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-tight">
            Know what your LLM app<br />
            <span className="text-blue-600 dark:text-blue-400">really costs</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            Paste a GitHub repo URL. We scan for LLM calls, estimate token usage,
            and compare costs across 14+ models — instantly.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-6"
        >
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            GitHub Repository URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                size={18}
              />
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Analyze
            </button>
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>
          )}

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="mt-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  GitHub Token{" "}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    (optional — avoids rate limits)
                  </span>
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Daily call volume{" "}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    (for cost projections)
                  </span>
                </label>
                <input
                  type="number"
                  value={callsPerDay}
                  onChange={(e) => setCallsPerDay(Number(e.target.value))}
                  min={1}
                  max={10_000_000}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* AI recommender opt-in */}
              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
                      <Sparkles size={13} className="text-violet-500" />
                      Use AI to pick the best model per use case
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Sends one batched request to Claude Haiku with your API key. Typical
                      cost: &lt;$0.01 per scan. Falls back to the heuristic on any error.
                    </span>
                  </span>
                </label>

                {useAi && (
                  <div className="mt-2 pl-6">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Anthropic API key
                    </label>
                    <input
                      type="password"
                      value={aiKey}
                      onChange={(e) => setAiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Used once per scan, never stored or logged.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Sample repos */}
        <div className="mt-5">
          <p className="text-center text-sm text-slate-400 dark:text-slate-500 mb-2">
            Try a sample repo:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLE_REPOS.map((r) => (
              <button
                key={r.url}
                onClick={() => setRepoUrl(r.url)}
                className="text-xs px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
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
            <div
              key={f.label}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4"
            >
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {f.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
