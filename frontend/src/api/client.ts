import type { CostReport, StreamEvent } from "../types";

export type AnalyzeErrorKind =
  | "rate_limit"
  | "not_found"
  | "auth"
  | "validation"
  | "server"
  | "network"
  | "stream"
  | "unknown";

/**
 * Structured error thrown by the /analyze and /reports clients.
 * Includes a `kind` discriminator the UI can switch on to render
 * different messaging (e.g. a 429 should suggest waiting, a 404
 * should suggest checking the URL or supplying a token).
 */
export class AnalyzeError extends Error {
  kind: AnalyzeErrorKind;
  status?: number;
  retryAfterSeconds?: number;

  constructor(
    kind: AnalyzeErrorKind,
    message: string,
    opts: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "AnalyzeError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

function classifyHttpStatus(status: number): AnalyzeErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

async function parseErrorBody(resp: Response): Promise<string> {
  // FastAPI and slowapi both return JSON like {"detail": "..."}.
  // Fall back to raw text so we never throw while trying to throw.
  try {
    const text = await resp.text();
    if (!text) return `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.detail === "string") return parsed.detail;
      if (Array.isArray(parsed.detail)) {
        // Pydantic validation errors
        return parsed.detail.map((e: { msg?: string }) => e.msg ?? "invalid").join("; ");
      }
      if (typeof parsed.message === "string") return parsed.message;
      return text.length > 300 ? text.slice(0, 300) + "…" : text;
    } catch {
      return text.length > 300 ? text.slice(0, 300) + "…" : text;
    }
  } catch {
    return `HTTP ${resp.status}`;
  }
}

function errorFromResponse(resp: Response, body: string): AnalyzeError {
  const kind = classifyHttpStatus(resp.status);
  const retryAfter = resp.headers.get("Retry-After");
  const retrySec = retryAfter ? parseInt(retryAfter, 10) : undefined;
  return new AnalyzeError(kind, body, {
    status: resp.status,
    retryAfterSeconds: Number.isFinite(retrySec) ? retrySec : undefined,
  });
}

export async function fetchSharedReport(reportId: string): Promise<CostReport> {
  let resp: Response;
  try {
    resp = await fetch(`/reports/${encodeURIComponent(reportId)}`);
  } catch (e) {
    throw new AnalyzeError("network", `Network error: ${(e as Error).message}`);
  }
  if (!resp.ok) {
    const body = await parseErrorBody(resp);
    throw errorFromResponse(resp, body);
  }
  return resp.json();
}

export async function analyzeRepo(
  repoUrl: string,
  githubToken: string | null,
  callsPerDay: number,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_url: repoUrl,
        github_token: githubToken || null,
        calls_per_day: callsPerDay,
      }),
    });
  } catch (e) {
    throw new AnalyzeError("network", `Couldn't reach the analysis server: ${(e as Error).message}`);
  }

  if (!resp.ok) {
    const body = await parseErrorBody(resp);
    throw errorFromResponse(resp, body);
  }

  if (!resp.body) {
    throw new AnalyzeError("stream", "No response body from server — streaming not supported.");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
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
  } catch (e) {
    throw new AnalyzeError(
      "stream",
      `Connection dropped while analyzing. ${(e as Error).message || "Try again."}`,
    );
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
