import { useState } from "react";
import { Share2, Check } from "lucide-react";

interface Props {
  reportId: string;
}

export default function ShareButton({ reportId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/r/${reportId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: put the URL in the browser bar
      window.prompt("Copy this URL:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      aria-label="Copy shareable link"
      title="Copy shareable link"
    >
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
