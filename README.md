# AI Cost Modeling Platform

A tool that analyzes any public GitHub repository, detects every LLM API call in the codebase, estimates token usage with a real tokenizer, and computes what those calls would cost across 14+ AI models — including a recommender that suggests cheaper alternatives per call site.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture Overview](#architecture-overview)
3. [How It Works — Step by Step](#how-it-works--step-by-step)
4. [Backend Deep Dive](#backend-deep-dive)
5. [Frontend Deep Dive](#frontend-deep-dive)
6. [APIs Used](#apis-used)
7. [Pricing Data](#pricing-data)
8. [Tech Stack](#tech-stack)
9. [Running Locally](#running-locally)
10. [Project Structure](#project-structure)
11. [Limitations & Design Decisions](#limitations--design-decisions)

---

## What It Does

1. You paste a GitHub repository URL.
2. The backend fetches every source file from that repo using the GitHub API.
3. Each file is scanned with regex patterns that identify LLM SDK calls (OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, Gemini).
4. For each detected call, the tool:
   - Extracts the model name declared in the code (e.g. `model="gpt-4o-2024-08-06"`)
   - Resolves that to a canonical pricing ID
   - Estimates token counts using OpenAI's **tiktoken** tokenizer
   - Computes the cost at that specific model's prices
   - Runs a recommender to suggest a cheaper model with equivalent strengths
5. Results are streamed back in real time as the repo is fetched.
6. The frontend displays cost tables, projections, a per-call breakdown with syntax highlighting, per-file aggregates, and swap recommendations.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                             │
│  Home page          Analysis page                           │
│  ─────────          ─────────────                           │
│  URL input  ──────► Streaming fetch ◄── NDJSON chunks       │
│                     Progress bar                            │
│                     Summary card (actual cost + savings)    │
│                     Cost table (all 14 models)              │
│                     Cost projection (log-scale slider)      │
│                     Recommendations panel                    │
│                     File breakdown panel                     │
│                     Call breakdown table (search/filter)    │
└────────────────────────────┬────────────────────────────────┘
                             │ POST /analyze  (streaming NDJSON)
                             │ GET  /pricing
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                  │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ github_     │   │  detector.py │   │ model_resolver  │  │
│  │ client.py   │──►│  (regex scan)│──►│ (alias map)     │  │
│  │             │   │              │   └────────┬────────┘  │
│  │ GitHub API  │   │ 6 SDKs       │            │           │
│  │ trees +     │   │ 50+ patterns │   ┌────────▼────────┐  │
│  │ contents    │   │              │   │ token_estimator │  │
│  └─────────────┘   └──────────────┘   │ (tiktoken)      │  │
│                                       └────────┬────────┘  │
│  ┌──────────────────────────────────────────────▼────────┐  │
│  │               cost_calculator.py                      │  │
│  │  • Per-model summaries (all 14 models)                │  │
│  │  • Per-call actual cost (declared model)              │  │
│  │  • Per-file aggregates                                │  │
│  │  • Daily/monthly projections                          │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │               recommender.py                          │  │
│  │  • Picks cheapest model per task type + strengths     │  │
│  │  • Computes savings_usd per call                      │  │
│  │  • Repo-level total potential savings                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    GitHub REST API v3
                    (public repos, no auth required;
                     PAT optional for rate limits)
```

---

## How It Works — Step by Step

### Step 1: URL Parsing

The user enters a GitHub URL like `https://github.com/owner/repo` or `https://github.com/owner/repo/tree/main/subdir`.

`github_client.py` parses this into `(owner, repo, ref)`. If no branch/ref is specified, it defaults to `HEAD`.

### Step 2: Repository Fetching

The backend calls the **GitHub Trees API**:

```
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1
```

This returns the full file tree of the repo in a single request. Files are filtered to only source code types:

- Python: `.py`, `.ipynb`
- JavaScript/TypeScript: `.js`, `.ts`, `.jsx`, `.tsx`
- Configuration: `.yaml`, `.yml`, `.json`, `.toml`, `.env`

Binary files, assets, lock files, and build artifacts are excluded.

Each file is then fetched individually via the **GitHub Contents API**:

```
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
```

The response contains the file content Base64-encoded. The backend decodes it to plain text.

Up to **5 files are fetched concurrently** (controlled by `asyncio.Semaphore(5)`) to stay within GitHub's rate limits while keeping things fast.

Progress events are streamed back to the browser as each batch completes:

```json
{"type": "progress", "files_scanned": 12, "total": 47}
```

### Step 3: LLM Call Detection

`detector.py` scans each file line by line using compiled regular expressions.

**Detection approach:**
- Skip comment lines (`#`, `//`)
- Skip pure import lines (`from openai import`, `import anthropic`) — these are not call sites
- Match against 50+ regex patterns grouped by SDK

**Example patterns:**

| SDK | Pattern | Matches |
|---|---|---|
| openai | `\w+\.chat\.completions\.create` | `client.chat.completions.create(...)` |
| anthropic | `\w+\.messages\.create` | `c.messages.create(...)` |
| langchain | `\bChatOpenAI\(` | `llm = ChatOpenAI(model=...)` |
| gemini | `model\.generate_content` | `model.generate_content(prompt)` |

Using `\w+` instead of hard-coding `client` means the scanner catches any variable name — `c`, `client`, `llm`, `ai`, etc.

For each matched line, a **context window** of ±5 lines is extracted. That context is used to:
- Extract the model string: `MODEL_RE = r"""model\s*[:=]\s*['"]([^'"]+)['"]"""`
- Extract a prompt snippet from string literals
- Infer task type (chat, summarization, rag, coding, classification, embedding, reasoning)
- Detect streaming vs. standard calls

### Step 4: Model Resolution

Raw model strings found in code (e.g. `"gpt-4o-2024-08-06"`, `"claude-3-5-sonnet-20241022"`) are resolved to canonical pricing IDs via `model_resolver.py`:

**Resolution priority:**
1. **Exact match** — is the string already a known canonical ID?
2. **Alias map** — 50+ curated mappings of snapshot versions to base IDs
3. **Family prefix fuzzy match** — `"gpt-4o-*"` → `"gpt-4o"`, `"claude-3-haiku-*"` → `"claude-3-haiku"`
4. **Unresolvable** — returns `None`, cost shown as `—`

### Step 5: Token Estimation

`token_estimator.py` uses **OpenAI's tiktoken library** when available:

- **cl100k_base** encoding — used for GPT-4 Turbo, GPT-3.5, Claude, Gemini, and most others
- **o200k_base** encoding — used for GPT-4o and GPT-4o Mini (their actual encoding)

If tiktoken is unavailable it falls back to a character-count heuristic (1 token ≈ 3 chars for code, 4 for prose).

When no prompt snippet is found in the context, a task-type default is used:

| Task | Input tokens (default) | Output tokens (default) |
|---|---|---|
| RAG | 4,000 | 500 |
| Coding | 2,000 | 800 |
| Reasoning | 1,500 | 1,000 |
| Chat | 800 | 400 |
| Summarization | 2,000 | 300 |
| Classification | 500 | 20 |

### Step 6: Cost Calculation

Cost is calculated two ways:

**Actual cost** — uses the model declared in the code (when resolvable):
```
cost = (input_tokens / 1,000,000) × input_price_per_mtoken
     + (output_tokens / 1,000,000) × output_price_per_mtoken
```

**Cross-model comparison** — the same formula applied to all 14 models in the pricing table, so you can see what the same calls would cost if you switched providers.

### Step 7: Recommender

`recommender.py` picks the cheapest viable replacement for each call:

1. Filter models that list the call's **task type** in their `strengths` array
2. Sort those candidates by cost for this specific call (tokens × prices)
3. Pick the cheapest candidate
4. Only emit a recommendation if savings ≥ `$0.00001` AND ≥ 15% cheaper than current

This avoids noise (e.g. suggesting a 0.001¢ saving) while surfacing meaningful swaps like switching a classification call from Claude 3 Opus to Mistral 7B.

### Step 8: Streaming Response

The `/analyze` endpoint uses FastAPI's `StreamingResponse` with `application/x-ndjson` (newline-delimited JSON). Each line is a separate JSON object:

```
{"type": "progress", "files_scanned": 5, "total": 47}
{"type": "progress", "files_scanned": 12, "total": 47}
{"type": "progress", "stage": "scanning", "files_scanned": 47}
{"type": "result", "data": { ... full CostReport ... }, "warning": null}
```

Or on error:
```
{"type": "error", "message": "Repository not found. Check the URL or make sure the repo is public."}
```

The frontend reads this stream using the browser's `ReadableStream` API with a `TextDecoder`, updating the UI progressively.

---

## Backend Deep Dive

### File: `services/github_client.py`

Handles all GitHub API communication.

- `_parse_repo_url(url)` — validates and parses GitHub URLs, rejects non-github.com domains
- `fetch_repo_files(repo_url, token, on_progress)` — orchestrates the full fetch:
  1. GET trees (recursive)
  2. Filter to relevant file extensions
  3. Fetch each file content concurrently (semaphore-limited)
  4. Base64-decode responses
  5. Fire `on_progress` callbacks for streaming

### File: `services/detector.py`

The core scanner.

- `scan_file(file_path, content)` — line-by-line scan, returns `List[DetectedCall]`
- `scan_all_files(files)` — applies `scan_file` across the whole repo
- Uses `seen_lines` set to avoid double-counting (a line can only match once even if multiple patterns apply)

### File: `services/model_resolver.py`

Alias resolution. Contains:
- `ALIAS_MAP` — 50+ explicit snapshot → canonical mappings
- `FAMILY_PREFIXES` — ordered prefix rules for fuzzy matching
- `resolve_model_id(raw)` — main entry point

### File: `services/recommender.py`

Model swap recommendation logic.

- `recommend_for_calls(calls)` — returns `List[Recommendation]`
- `apply_recommendations_to_calls(calls, recs)` — mutates calls in-place so frontend can render per-row recommendation banners

### File: `services/cost_calculator.py`

- `build_model_summaries(calls)` — total cost across all 14 models
- `build_projections(summaries, calls_per_day, num_call_sites)` — daily/monthly cost at a given volume
- `build_file_breakdowns(calls)` — aggregates by file path
- `compute_actual_total(calls)` — sums costs for resolved calls only
- `compute_recommended_total(calls)` — what total cost would be after all swaps

### File: `models/pricing.py`

Static pricing data. Each `ModelPricing` dataclass has:

```python
@dataclass
class ModelPricing:
    id: str                       # canonical ID
    display_name: str
    provider: str                 # "openai" | "anthropic" | "google" | ...
    context_window: int           # tokens
    input_price_per_mtoken: float # USD per 1M input tokens
    output_price_per_mtoken: float
    strengths: List[str]          # task types this model excels at
    quality_tier: str             # "budget" | "mid" | "premium"
    supports_vision: bool
    supports_function_calling: bool
```

### File: `routers/analyze.py`

FastAPI router with two endpoints:

- `POST /analyze` — accepts `AnalyzeRequest` body, returns streaming NDJSON
- `GET /pricing` — returns the full pricing table as JSON (used to populate the pricing page)

The SENTINEL pattern prevents a race condition between the async fetch task and the streaming loop:

```python
SENTINEL = object()

async def fetch_wrapper():
    try:
        return await fetch_repo_files(...)
    finally:
        await progress_queue.put((SENTINEL,))  # always signals completion

while True:
    item = await progress_queue.get()
    if item[0] is SENTINEL:
        break  # fetch is done, safe to await the task result
```

---

## Frontend Deep Dive

### Pages

**`pages/Home.tsx`** — Landing page with URL input, advanced options (GitHub token, calls/day), and sample repo quick-links.

**`pages/Analysis.tsx`** — Main results page. Subscribes to the streaming NDJSON response and progressively renders components as data arrives.

### Components

| Component | Purpose |
|---|---|
| `SummaryCard` | Stats bar: files scanned, call sites, actual cost at declared models, potential savings with comparison bar |
| `CostTable` | Sortable table of all 14 models with input/output prices and total cost. Toggle to bar chart. |
| `CostProjection` | Log-scale slider (1 → 1M calls/day) with per-model daily/monthly projections |
| `Recommendations` | Ranked list of swap opportunities with current → recommended model, savings, and rationale |
| `FileBreakdowns` | Per-file aggregate (call count, tokens, cost, SDKs) with expandable call list |
| `CallBreakdown` | Full paginated call table with search, SDK filter, sort, and expandable rows with syntax-highlighted code |
| `ThemeToggle` | Sun/Moon button that switches between light and dark mode (persisted to localStorage) |

### State & Streaming

`api/client.ts` reads the NDJSON stream:

```typescript
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
    if (line.trim()) onEvent(JSON.parse(line));
  }
}
```

### Dark Mode

Tailwind's `darkMode: "class"` strategy is used. `ThemeProvider` adds/removes the `dark` class on `<html>` and persists the preference to `localStorage`. It also reads `prefers-color-scheme` on first load.

### Code Splitting

Pages are lazy-loaded with React's `lazy()` + `Suspense`, so the Vite bundle is split into separate chunks per route rather than one monolithic file.

---

## APIs Used

### GitHub REST API v3

**Base URL:** `https://api.github.com`

| Endpoint | Purpose |
|---|---|
| `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1` | Fetch the full file tree of the repo in one request |
| `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` | Fetch individual file content (Base64-encoded) |

**Authentication:** Optional. Without a token, GitHub allows ~60 requests/hour per IP. With a Personal Access Token (`ghp_...`) it raises to 5,000/hour. The token is passed as `Authorization: Bearer {token}` header.

**Rate limit handling:** HTTP 403 responses from GitHub are detected and surfaced as a user-friendly message: *"GitHub API rate limit reached — try providing a personal access token."*

**No GitHub App or OAuth is required** — the API is used in read-only mode on public repos.

---

## Pricing Data

Pricing is stored as static data in `backend/models/pricing.py`. All prices are in **USD per 1 million tokens**.

| Model | Provider | Input $/MTok | Output $/MTok | Quality |
|---|---|---|---|---|
| GPT-4o | OpenAI | $2.50 | $10.00 | Premium |
| GPT-4o Mini | OpenAI | $0.15 | $0.60 | Budget |
| GPT-4 Turbo | OpenAI | $10.00 | $30.00 | Premium |
| GPT-3.5 Turbo | OpenAI | $0.50 | $1.50 | Budget |
| Claude 3.5 Sonnet | Anthropic | $3.00 | $15.00 | Premium |
| Claude 3 Haiku | Anthropic | $0.25 | $1.25 | Budget |
| Claude 3 Opus | Anthropic | $15.00 | $75.00 | Premium |
| Gemini 1.5 Pro | Google | $1.25 | $5.00 | Premium |
| Gemini 1.5 Flash | Google | $0.075 | $0.30 | Budget |
| Llama 3 70B (Groq) | Groq | $0.59 | $0.79 | Mid |
| Llama 3 8B (Groq) | Groq | $0.05 | $0.08 | Budget |
| Mistral Large | Mistral | $2.00 | $6.00 | Mid |
| Mistral 7B | Mistral | $0.025 | $0.025 | Budget |
| Command R+ | Cohere | $2.50 | $10.00 | Mid |

> Prices reflect publicly listed API rates and are hardcoded. They are not fetched live.

---

## Tech Stack

### Backend

| Library | Version | Role |
|---|---|---|
| Python | 3.14 | Runtime |
| FastAPI | 0.115 | Web framework, async routing, streaming responses |
| Uvicorn | 0.29 | ASGI server |
| Pydantic v2 | ≥2.13 | Request/response validation and serialization |
| httpx | 0.27 | Async HTTP client for GitHub API |
| tiktoken | 0.12 | OpenAI's tokenizer (cl100k_base, o200k_base) |
| python-dotenv | 1.0 | Environment variable loading |

### Frontend

| Library | Version | Role |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 6 | Type safety |
| Vite | 8 | Build tool, dev server, HMR |
| Tailwind CSS | 3.4 | Utility-first styling |
| React Router | 7 | Client-side routing |
| Recharts | 3 | Bar charts for cost visualization |
| prism-react-renderer | latest | Syntax highlighting in call detail rows |
| lucide-react | latest | Icons |

---

## Running Locally

### Prerequisites

- Python 3.12+ (3.14 recommended)
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

### Environment Variables (optional)

Create `backend/.env`:

```env
# Add a default GitHub token to avoid rate limits
GITHUB_TOKEN=ghp_your_token_here
```

---

## Project Structure

```
Ai-Cost-Modeling-Platform/
├── backend/
│   ├── main.py                    # FastAPI app entry point, CORS config
│   ├── requirements.txt
│   ├── models/
│   │   ├── pricing.py             # 14 ModelPricing dataclass instances
│   │   └── schemas.py             # Pydantic request/response models
│   ├── routers/
│   │   └── analyze.py             # POST /analyze, GET /pricing, GET /health
│   ├── services/
│   │   ├── github_client.py       # GitHub API fetching + concurrency
│   │   ├── detector.py            # Regex LLM call scanner
│   │   ├── model_resolver.py      # Alias map + fuzzy model ID resolution
│   │   ├── recommender.py         # Cheapest-viable-model recommender
│   │   └── cost_calculator.py     # Cost math, projections, file breakdowns
│   └── utils/
│       ├── token_estimator.py     # tiktoken + heuristic fallback
│       └── file_filter.py         # Extension whitelist + size limits
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js         # darkMode: "class"
    └── src/
        ├── App.tsx                # Router + ThemeProvider + lazy page loading
        ├── types/index.ts         # All TypeScript interfaces
        ├── api/
        │   └── client.ts          # Streaming NDJSON fetch logic
        ├── theme/
        │   └── ThemeProvider.tsx  # Dark mode context + localStorage
        ├── utils/
        │   └── formatters.ts      # fmtCost, fmtTokens, fmtPercent
        ├── pages/
        │   ├── Home.tsx           # Landing page
        │   └── Analysis.tsx       # Results page
        └── components/
            ├── ThemeToggle.tsx    # Sun/Moon button
            ├── SummaryCard.tsx    # Stats bar + savings comparison
            ├── CostTable.tsx      # 14-model table + bar chart toggle
            ├── CostProjection.tsx # Log-scale slider + projection table
            ├── Recommendations.tsx # Swap opportunities panel
            ├── FileBreakdowns.tsx  # Per-file aggregate table
            └── CallBreakdown.tsx  # Full call table with search + highlighting
```

---

## Limitations & Design Decisions

**Regex detection, not AST parsing**
The scanner uses regular expressions rather than parsing the AST. This is intentional — it works across Python, TypeScript, JavaScript, and any other language without needing per-language parsers. The trade-off is occasional false positives (mitigated by skipping comment and import lines) and false negatives (multi-line calls where the `model=` argument is on a different line from the function call). An AST parser would be more accurate but would require separate parsers per language.

**Token estimation accuracy**
tiktoken gives exact counts for OpenAI models. For Anthropic, Google, and others, their tokenizers differ slightly but produce similar counts for the same text. The estimates are accurate to ±10% for most real-world prompts.

**No live pricing**
Prices are hardcoded. They reflect publicly listed API rates at time of writing. Model pricing changes frequently — treat outputs as estimates and verify against provider pricing pages before making infrastructure decisions.

**Static pricing vs. per-call context sizing**
The tool estimates tokens from prompt snippets found near the call site. In production code the actual prompt is often assembled dynamically (e.g. from database content, user input). The defaults (e.g. 4,000 tokens for RAG) are reasonable estimates for those cases but may not match reality for your specific workload.

**GitHub API rate limits**
Without a token: 60 requests/hour. Large repos (1,000+ files) will hit this. The error message prompts users to add a Personal Access Token in the Advanced options panel.

**No auth, no persistence**
The tool is stateless. Every analysis runs fresh. There is no database, no user accounts, and no result caching. Each request fetches and scans the repo from scratch.
