"""
Enhanced regex-based detector for JS / TS / JSX / TSX / notebook code.

Used as the primary scanner for non-Python files and as a fallback when the
Python AST detector fails (syntax errors, Py2 code, extracted notebook cells).

Key improvements over a simple line scan:
  - Balanced-paren region extraction: when a trigger regex hits a line,
    expand forward through the file until the opening `(` is closed, so
    kwargs declared on later lines are visible to extraction.
  - Identifier-to-literal lookup: `const MODEL = "gpt-4o"` followed later by
    `model: MODEL` resolves correctly.
  - Loop detection: tracks brace depth and records which loop keywords
    (`for`, `while`, `.map`, `.forEach`) are still open at each line.
  - Vision + stream + max_tokens extraction from the full region.
"""
from __future__ import annotations

import re
import uuid
from typing import List, Optional

from models.pricing import MODEL_PRICING_MAP
from models.schemas import DetectedCall
from services.model_resolver import resolve_model_id
from utils.token_estimator import (
    default_input_tokens,
    default_output_tokens,
    estimate_tokens,
)

LOOP_MULTIPLIER_DEFAULT = 10
VISION_INPUT_BUMP = 1000


# ---------------------------------------------------------------------------
# SDK triggers — one regex per "call site pattern", each tagged with an SDK.
# We match on the trigger line; then we expand the region to the matching `)`.
# ---------------------------------------------------------------------------

# Each pattern is (sdk, compiled_regex, call_type_hint)
TRIGGER_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    # OpenAI
    ("openai", re.compile(r"\w+\.chat\.completions\.create\s*\("), "chat"),
    ("openai", re.compile(r"\w+\.completions\.create\s*\("), "completion"),
    ("openai", re.compile(r"\w+\.embeddings\.create\s*\("), "embedding"),
    ("openai", re.compile(r"\w+\.responses\.create\s*\("), "chat"),
    ("openai", re.compile(r"openai\.ChatCompletion\.create\s*\("), "chat"),
    ("openai", re.compile(r"openai\.Completion\.create\s*\("), "completion"),
    # Anthropic
    ("anthropic", re.compile(r"\w+\.messages\.create\s*\("), "chat"),
    ("anthropic", re.compile(r"\w+\.messages\.stream\s*\("), "stream"),
    # Gemini
    ("gemini", re.compile(r"\w+\.generateContent\s*\("), "chat"),
    ("gemini", re.compile(r"model\.generate_content\s*\("), "chat"),
    ("gemini", re.compile(r"\w+\.sendMessage\s*\("), "chat"),
    # Cohere
    ("cohere", re.compile(r"\bco\.chat\s*\("), "chat"),
    ("cohere", re.compile(r"\bco\.generate\s*\("), "completion"),
    ("cohere", re.compile(r"\bco\.embed\s*\("), "embedding"),
    ("cohere", re.compile(r"\bco\.rerank\s*\("), "chat"),
    # LangChain (JS)
    ("langchain", re.compile(r"\bllm\.invoke\s*\("), "chat"),
    ("langchain", re.compile(r"\bchain\.invoke\s*\("), "chat"),
]

# Detect constructor calls that bind a variable → SDK (for .invoke attribution)
CTOR_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("langchain", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+ChatOpenAI\s*\(")),
    ("langchain", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+ChatAnthropic\s*\(")),
    ("langchain", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+ChatGoogleGenerativeAI\s*\(")),
    ("openai", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+OpenAI\s*\(")),
    ("anthropic", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+Anthropic\s*\(")),
    ("gemini", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+GoogleGenerativeAI\s*\(")),
    ("gemini", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*(?:\w+\.)?getGenerativeModel\s*\(")),
    ("cohere", re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+CohereClient\s*\(")),
]

# Simple string-const binding: `const NAME = "value"` or `NAME = "value"`
STRING_CONST_RE = re.compile(
    r"""\b(?:const|let|var)?\s*(\w+)\s*[:=]\s*["']([^"'\n]+)["']"""
)

# Kwarg extraction from a call region
MODEL_LITERAL_RE = re.compile(r"""\bmodel\s*[:=]\s*["']([^"'\n]+)["']""")
MODEL_IDENT_RE = re.compile(r"""\bmodel\s*[:=]\s*([A-Za-z_][A-Za-z0-9_]*)\b""")
MAX_TOKENS_RE = re.compile(r"""\bmax_?tokens\s*[:=]\s*(\d+)""", re.IGNORECASE)
MAX_OUTPUT_TOKENS_RE = re.compile(r"""\bmax_?(?:output_?|completion_?)tokens\s*[:=]\s*(\d+)""", re.IGNORECASE)
STREAM_RE = re.compile(r"""\bstream\s*[:=]\s*true""", re.IGNORECASE)
VISION_RE = re.compile(r"""["']?(image_url|input_image)["']?|\.png|\.jpg|\.jpeg|\.webp""", re.IGNORECASE)

# Multi-line string-literal harvest for prompt context
STRING_LITERAL_RE = re.compile(r"""['"]([^'"\n]{15,})['"]|`([^`]{15,})`""")

# Task keyword inference (shared with Python path semantics)
TASK_KEYWORDS = [
    ("summarization", re.compile(r"summariz|tldr|brief|condense|shorten", re.I)),
    ("classification", re.compile(r"classif|categor|label|sentiment|intent", re.I)),
    ("rag", re.compile(r"retriev|document|context|chunk|vector|search|passage|knowledge", re.I)),
    ("coding", re.compile(r"\bcode\b|function|implement|debug|refactor|program|script", re.I)),
    ("reasoning", re.compile(r"reason|step.by.step|chain.of.thought|solve|analyz|think", re.I)),
    ("embedding", re.compile(r"embed|embedding", re.I)),
]

COMMENT_RE = re.compile(r"^\s*(#|//|\*|/\*)")
IMPORT_RE = re.compile(r"^\s*(from\s+\S+\s+import|import\s+\S+|const\s+.*=\s*require\()")

# Block comment stripping. We handle `/* ... */` that open and close on the same
# line by collapsing them away before scanning. Multi-line block comments are
# tracked via _in_block_comment below.
_SINGLE_LINE_BLOCK_RE = re.compile(r"/\*.*?\*/")

# Tokens that open a loop scope when followed by `(` or body-start.
_LOOP_LINE_RE = re.compile(
    r"""(\bfor\s*\(|\bfor\s+\w+\s+in\s+|\bwhile\s*\(|\.map\s*\(|\.forEach\s*\(|\.filter\s*\()""",
)


# ---------------------------------------------------------------------------
# Region extraction: given a trigger at `line_idx`, expand forward through
# the source balancing parens from the first '(' to its matching ')'.
# Returns (region_text, end_line_idx_exclusive).
# ---------------------------------------------------------------------------

def _extract_region(lines: list[str], line_idx: int) -> tuple[str, int]:
    # Find the first '(' on the trigger line at or after the match position.
    start_line = lines[line_idx]
    paren_idx = start_line.find("(")
    if paren_idx < 0:
        # Unusual — pattern matched without a '(' on the same line. Bail with
        # a small window so we still get *something*.
        end = min(len(lines), line_idx + 5)
        return "\n".join(lines[line_idx:end]), end

    depth = 0
    in_string: Optional[str] = None
    region_chars: list[str] = []
    cur_line = line_idx
    cur_col = paren_idx
    # Safety cap — no single call should span more than 200 lines
    max_lines = min(len(lines), line_idx + 200)

    while cur_line < max_lines:
        line = lines[cur_line]
        while cur_col < len(line):
            ch = line[cur_col]
            region_chars.append(ch)
            if in_string is not None:
                if ch == in_string and (cur_col == 0 or line[cur_col - 1] != "\\"):
                    in_string = None
            else:
                if ch in ("'", '"', "`"):
                    in_string = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                    if depth == 0:
                        return "".join(region_chars), cur_line + 1
            cur_col += 1
        region_chars.append("\n")
        cur_line += 1
        cur_col = 0

    return "".join(region_chars), cur_line


# ---------------------------------------------------------------------------
# Loop depth tracking by scanning from start of file.
# Returns a list `loop_depth[line_idx]` — how many open loops surround that line.
# ---------------------------------------------------------------------------

def _compute_loop_depths(lines: list[str]) -> list[int]:
    loop_stack: list[int] = []  # stack of open brace-depths at which loops opened
    brace_depth = 0
    depths: list[int] = []

    for line in lines:
        # Record depth at start of line
        depths.append(len(loop_stack))

        # Update running counts from this line
        in_string: Optional[str] = None
        saw_loop_keyword = _LOOP_LINE_RE.search(line) is not None

        for i, ch in enumerate(line):
            if in_string is not None:
                if ch == in_string and (i == 0 or line[i - 1] != "\\"):
                    in_string = None
                continue
            if ch in ("'", '"', "`"):
                in_string = ch
            elif ch == "{":
                if saw_loop_keyword and (not loop_stack or loop_stack[-1] < brace_depth + 1):
                    # First `{` after a loop keyword on this line — consider it the loop body.
                    loop_stack.append(brace_depth)
                    saw_loop_keyword = False
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if loop_stack and loop_stack[-1] >= brace_depth:
                    loop_stack.pop()

    return depths


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _collect_string_consts(content: str) -> dict[str, str]:
    """Scan whole file for `const NAME = "..."` style bindings."""
    out: dict[str, str] = {}
    for m in STRING_CONST_RE.finditer(content):
        name, val = m.group(1), m.group(2)
        # Don't clobber — first assignment wins, usually the meaningful one
        if name not in out:
            out[name] = val
    return out


def _collect_ctor_bindings(content: str) -> dict[str, str]:
    """var_name → SDK from `const x = new ChatOpenAI(...)` style."""
    out: dict[str, str] = {}
    for sdk, pat in CTOR_PATTERNS:
        for m in pat.finditer(content):
            out[m.group(1)] = sdk
    return out


def _infer_task_type(text: str, call_type: str) -> str:
    if call_type == "embedding":
        return "embedding"
    for task, pat in TASK_KEYWORDS:
        if pat.search(text):
            return task
    return "chat"


def _actual_cost(input_tokens: int, output_tokens: int, resolved_model_id: Optional[str]) -> Optional[float]:
    if not resolved_model_id:
        return None
    pricing = MODEL_PRICING_MAP.get(resolved_model_id)
    if not pricing:
        return None
    return (
        (input_tokens / 1_000_000) * pricing.input_price_per_mtoken
        + (output_tokens / 1_000_000) * pricing.output_price_per_mtoken
    )


def _extract_region_prompt(region: str) -> tuple[str, bool]:
    """Harvest string literals from the region as prompt proxy; detect vision."""
    has_vision = bool(VISION_RE.search(region))
    snippets: list[str] = []
    for m in STRING_LITERAL_RE.finditer(region):
        text = m.group(1) or m.group(2)
        if not text:
            continue
        # Skip obvious model IDs / role markers — they aren't prompt content
        if text in {"user", "system", "assistant", "text", "image_url"}:
            continue
        snippets.append(text.strip())
    return " ".join(snippets)[:2000], has_vision


def _matches_invocation_on_ctor(
    line: str, ctor_bindings: dict[str, str]
) -> Optional[tuple[str, str]]:
    """
    Detect `varName.invoke(` / `.ainvoke(` / `.stream(` / `.predict(` where
    varName is bound to a known SDK constructor. Returns (sdk, call_type).
    """
    m = re.search(r"\b(\w+)\.(invoke|ainvoke|stream|astream|predict|apredict|call|batch)\s*\(", line)
    if not m:
        return None
    var, attr = m.group(1), m.group(2)
    sdk = ctor_bindings.get(var)
    if sdk is None:
        return None
    call_type = "stream" if attr in {"stream", "astream"} else "chat"
    return sdk, call_type


def scan_js_file(file_path: str, content: str) -> List[DetectedCall]:
    lines = content.splitlines()
    string_consts = _collect_string_consts(content)
    ctor_bindings = _collect_ctor_bindings(content)
    loop_depths = _compute_loop_depths(lines)

    # Mark lines that fall fully within `/* ... */` block comments so we don't
    # accidentally detect calls inside them. Single-line `/* ... */` is stripped
    # per-line before trigger matching.
    in_block = [False] * len(lines)
    block_open = False
    for i, raw in enumerate(lines):
        if block_open:
            in_block[i] = True
            if "*/" in raw:
                block_open = False
            continue
        # If a block opens on this line and doesn't close here, mark future lines
        if "/*" in raw and "*/" not in raw.split("/*", 1)[1]:
            block_open = True

    calls: list[DetectedCall] = []
    seen_lines: set[int] = set()

    for line_idx, raw_line in enumerate(lines):
        if line_idx in seen_lines:
            continue
        if in_block[line_idx]:
            continue
        # Strip `/* ... */` on the same line before any downstream checks.
        line = _SINGLE_LINE_BLOCK_RE.sub("", raw_line)
        if COMMENT_RE.match(line):
            continue
        if IMPORT_RE.match(line):
            continue

        # 1. Try SDK triggers
        sdk: Optional[str] = None
        call_type: str = "chat"
        for s, pat, ct in TRIGGER_PATTERNS:
            if pat.search(line):
                sdk, call_type = s, ct
                break

        # 2. Try invocation on a known ctor-bound var
        if sdk is None:
            hit = _matches_invocation_on_ctor(line, ctor_bindings)
            if hit is not None:
                sdk, call_type = hit

        if sdk is None:
            continue

        # Expand to balanced-paren region
        region, end_line = _extract_region(lines, line_idx)
        # Skip every line we absorbed so nested triggers in the region
        # aren't reported as duplicate call sites.
        for i in range(line_idx, end_line):
            seen_lines.add(i)

        # ---- kwarg extraction ----
        model_hint: Optional[str] = None
        m = MODEL_LITERAL_RE.search(region)
        if m:
            model_hint = m.group(1)
        else:
            mi = MODEL_IDENT_RE.search(region)
            if mi and mi.group(1) in string_consts:
                model_hint = string_consts[mi.group(1)]

        resolved_model_id = resolve_model_id(model_hint)

        max_m = MAX_OUTPUT_TOKENS_RE.search(region) or MAX_TOKENS_RE.search(region)
        max_output_tokens = int(max_m.group(1)) if max_m else None

        if STREAM_RE.search(region):
            call_type = "stream"

        prompt_text, has_vision = _extract_region_prompt(region)
        task_type = _infer_task_type(prompt_text or region, call_type)
        is_code = file_path.endswith((".py", ".ts", ".js", ".tsx", ".jsx", ".mjs"))

        if prompt_text:
            input_tokens = estimate_tokens(
                prompt_text, is_code=is_code, resolved_model_id=resolved_model_id
            )
            input_tokens = max(input_tokens, default_input_tokens(task_type) // 4)
        else:
            input_tokens = default_input_tokens(task_type)

        if has_vision:
            input_tokens += VISION_INPUT_BUMP

        output_tokens = default_output_tokens(task_type)
        if max_output_tokens is not None:
            output_tokens = min(output_tokens, max_output_tokens)

        in_loop = loop_depths[line_idx] > 0 if line_idx < len(loop_depths) else False
        multiplier = LOOP_MULTIPLIER_DEFAULT if in_loop else 1

        actual_cost = _actual_cost(input_tokens, output_tokens, resolved_model_id)
        if actual_cost is not None:
            actual_cost *= multiplier

        calls.append(DetectedCall(
            id=str(uuid.uuid4()),
            file_path=file_path,
            line_number=line_idx + 1,
            sdk=sdk,
            model_hint=model_hint,
            resolved_model_id=resolved_model_id,
            task_type=task_type,
            call_type=call_type,
            estimated_input_tokens=input_tokens,
            estimated_output_tokens=output_tokens,
            actual_cost_usd=round(actual_cost, 6) if actual_cost is not None else None,
            prompt_snippet=prompt_text[:300] or None,
            raw_match=line.strip()[:200],
            in_loop=in_loop,
            call_multiplier=multiplier,
            has_vision=has_vision,
            max_output_tokens=max_output_tokens,
            detection_method="regex",
        ))

    return calls
