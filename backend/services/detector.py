"""
LLM call detection via regex line scanning.
Language-agnostic: works on Python, TypeScript, JavaScript, and Jupyter notebooks.
"""
from __future__ import annotations

import re
import uuid
from typing import List, Optional

from models.schemas import DetectedCall
from utils.token_estimator import (
    estimate_tokens,
    default_input_tokens,
    default_output_tokens,
)

# ---------------------------------------------------------------------------
# SDK trigger patterns
# ---------------------------------------------------------------------------

SDK_PATTERNS: dict[str, list[re.Pattern]] = {
    "openai": [
        re.compile(r"\w+\.chat\.completions\.create"),
        re.compile(r"\w+\.completions\.create"),
        re.compile(r"\.embeddings\.create"),
        re.compile(r"ChatCompletion\.create"),
        re.compile(r"openai\.ChatCompletion\.create"),
        re.compile(r"openai\.Completion\.create"),
        re.compile(r"new OpenAI\("),
        re.compile(r"OpenAIClient\("),
    ],
    "anthropic": [
        re.compile(r"\w+\.messages\.create"),
        re.compile(r"\w+\.messages\.stream"),
        re.compile(r"AnthropicBedrock\("),
        re.compile(r"AnthropicVertex\("),
        re.compile(r"\w+\.completions\.create"),
        re.compile(r"new Anthropic\("),
    ],
    "langchain": [
        re.compile(r"\bChatOpenAI\("),
        re.compile(r"\bChatAnthropic\("),
        re.compile(r"\bChatGoogleGenerativeAI\("),
        re.compile(r"\bChatCohere\("),
        re.compile(r"\bChatOllama\("),
        re.compile(r"\bllm\.invoke\("),
        re.compile(r"\bchain\.invoke\("),
        re.compile(r"\bllm\.predict\("),
    ],
    "llamaindex": [
        re.compile(r"LLMPredictor\("),
        re.compile(r"ServiceContext\.from_defaults"),
        re.compile(r"Settings\.llm\s*="),
        re.compile(r"VectorStoreIndex\.from_documents"),
        re.compile(r"\.query\("),  # LlamaIndex QueryEngine pattern
    ],
    "cohere": [
        re.compile(r"\bco\.chat\("),
        re.compile(r"\bco\.generate\("),
        re.compile(r"CohereClient\("),
        re.compile(r"\bco\.rerank\("),
        re.compile(r"\bco\.embed\("),
    ],
    "gemini": [
        re.compile(r"generativeai\.GenerativeModel"),
        re.compile(r"genai\.GenerativeModel"),
        re.compile(r"new GoogleGenerativeAI\("),
        re.compile(r"model\.generate_content"),
        re.compile(r"chat\.send_message"),
    ],
}

# Model string extraction: looks for model="xxx" or model: "xxx"
MODEL_RE = re.compile(r"""model\s*[:=]\s*['"]([^'"]+)['"]""")

# Stream detection
STREAM_RE = re.compile(r"stream\s*[:=]\s*true", re.IGNORECASE)

# String literal extraction (for prompt snippets)
STRING_LITERAL_RE = re.compile(r"""['"]([^'"]{20,})['"]|`([^`]{20,})`""")

# Task type keyword map
TASK_KEYWORDS = [
    ("summarization", re.compile(r"summariz|tldr|brief|condense|shorten", re.I)),
    ("classification", re.compile(r"classif|categor|label|sentiment|intent|detect", re.I)),
    ("rag", re.compile(r"retriev|document|context|chunk|vector|search|passage|knowledge", re.I)),
    ("coding", re.compile(r"\bcode\b|function|implement|debug|refactor|program|script", re.I)),
    ("reasoning", re.compile(r"reason|step.by.step|chain.of.thought|solve|analyz|think", re.I)),
    ("embedding", re.compile(r"embed|embedding", re.I)),
]

# Comment line patterns to skip
COMMENT_RE = re.compile(r"^\s*(#|//)")

# Pure import lines — these should NOT count as call sites
IMPORT_RE = re.compile(r"^\s*(from\s+\S+\s+import|import\s+\S+)(\s|$|;|#|//)")


def _infer_task_type(text: str, call_type: str) -> str:
    if call_type == "embedding":
        return "embedding"
    for task, pattern in TASK_KEYWORDS:
        if pattern.search(text):
            return task
    return "chat"


def _extract_context(lines: list, trigger_idx: int, window: int = 5) -> str:
    start = max(0, trigger_idx - window)
    end = min(len(lines), trigger_idx + window + 1)
    return "\n".join(lines[start:end])


def _extract_model_hint(context: str) -> Optional[str]:
    m = MODEL_RE.search(context)
    return m.group(1) if m else None


def _extract_prompt_snippet(context: str) -> Optional[str]:
    snippets = []
    for m in STRING_LITERAL_RE.finditer(context):
        text = m.group(1) or m.group(2)
        if text:
            snippets.append(text.strip())
    if not snippets:
        return None
    combined = " ".join(snippets)
    return combined[:300]


def _detect_call_type(context: str) -> str:
    if "embed" in context.lower():
        return "embedding"
    if STREAM_RE.search(context):
        return "stream"
    if "completion" in context.lower():
        return "completion"
    return "chat"


def scan_file(file_path: str, content: str) -> List[DetectedCall]:
    lines = content.splitlines()
    calls: List[DetectedCall] = []
    seen_lines: set = set()

    for sdk, patterns in SDK_PATTERNS.items():
        for line_idx, line in enumerate(lines):
            if COMMENT_RE.match(line):
                continue
            if IMPORT_RE.match(line):
                continue
            if line_idx in seen_lines:
                continue

            matched = False
            for pat in patterns:
                if pat.search(line):
                    matched = True
                    break

            if not matched:
                continue

            seen_lines.add(line_idx)
            context = _extract_context(lines, line_idx)
            call_type = _detect_call_type(context)
            model_hint = _extract_model_hint(context)
            prompt_snippet = _extract_prompt_snippet(context)
            task_type = _infer_task_type(prompt_snippet or context, call_type)

            # Token estimation
            is_code = file_path.endswith((".py", ".ts", ".js", ".tsx", ".jsx"))
            if prompt_snippet:
                input_tokens = estimate_tokens(prompt_snippet, is_code=is_code)
                input_tokens = max(input_tokens, default_input_tokens(task_type) // 4)
            else:
                input_tokens = default_input_tokens(task_type)

            output_tokens = default_output_tokens(task_type)

            calls.append(DetectedCall(
                id=str(uuid.uuid4()),
                file_path=file_path,
                line_number=line_idx + 1,
                sdk=sdk,
                model_hint=model_hint,
                task_type=task_type,
                call_type=call_type,
                estimated_input_tokens=input_tokens,
                estimated_output_tokens=output_tokens,
                prompt_snippet=prompt_snippet,
                raw_match=line.strip()[:200],
            ))

    return calls


def scan_all_files(files: list) -> List[DetectedCall]:
    """files: list of {"path": str, "content": str}"""
    all_calls: List[DetectedCall] = []
    for f in files:
        all_calls.extend(scan_file(f["path"], f["content"]))
    return all_calls
