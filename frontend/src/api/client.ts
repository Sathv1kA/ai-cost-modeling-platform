import type { CostReport, StreamEvent } from "../types";

export async function fetchSharedReport(reportId: string): Promise<CostReport> {
  const resp = await fetch(`/reports/${encodeURIComponent(reportId)}`);
  if (resp.status === 404) {
    throw new Error("Report not found — it may have expired.");
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server error ${resp.status}: ${text}`);
  }
  return resp.json();
}

export async function analyzeRepo(
  repoUrl: string,
  githubToken: string | null,
  callsPerDay: number,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const resp = await fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo_url: repoUrl,
      github_token: githubToken || null,
      calls_per_day: callsPerDay,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server error ${resp.status}: ${text}`);
  }

  if (!resp.body) {
    throw new Error("No response body from server — streaming not supported.");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event: StreamEvent = JSON.parse(trimmed);
        onEvent(event);
      } catch (e) {
        console.error("Failed to parse stream line:", trimmed, e);
      }
    }
  }

  // flush remaining
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()));
    } catch (e) {
      console.error("Failed to parse final stream line:", buffer, e);
    }
  }
}
