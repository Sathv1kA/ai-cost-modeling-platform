"""
AST-based Python LLM call detector.

Walks the Python AST to find LLM SDK calls, extract their kwargs precisely,
and attach structural signals (loop nesting, vision inputs, max_tokens caps)
that the regex path can't reliably produce.

Falls back gracefully: if ast.parse() raises SyntaxError (which is common for
notebook-converted code or Py2 files), the caller should use the regex detector.
"""
from __future__ import annotations

import ast
import uuid
from dataclasses import dataclass, field
from typing import List, Optional

from models.pricing import MODEL_PRICING_MAP
from models.schemas import DetectedCall
from services.model_resolver import resolve_model_id
from utils.token_estimator import (
    default_input_tokens,
    default_output_tokens,
    estimate_tokens,
)

# Loop multiplier — when we detect a call inside a for/while/comprehension we
# can't know the iterable size, so assume a middle-of-the-road 10 iterations.
LOOP_MULTIPLIER_DEFAULT = 10

# Vision calls typically add 85–765 tokens per image plus bigger prompts.
# Add a fixed bump to input tokens when we detect image content.
VISION_INPUT_BUMP = 1000


# ---------------------------------------------------------------------------
# Attribute-chain matchers
# ---------------------------------------------------------------------------
# A pattern is an (sdk, suffix, call_type) tuple where `suffix` is matched as
# a trailing sequence of attribute accesses on the call's receiver.

@dataclass(frozen=True)
class ChainPattern:
    sdk: str
    # Ordered list of attribute names ending the chain, e.g.
    # ["chat", "completions", "create"] matches `x.y.chat.completions.create(...)`.
    suffix: tuple
    call_type: str = "chat"


CHAIN_PATTERNS: tuple[ChainPattern, ...] = (
    # OpenAI
    ChainPattern("openai", ("chat", "completions", "create"), "chat"),
    ChainPattern("openai", ("completions", "create"), "completion"),
    ChainPattern("openai", ("embeddings", "create"), "embedding"),
    ChainPattern("openai", ("responses", "create"), "chat"),  # new Responses API
    # Anthropic
    ChainPattern("anthropic", ("messages", "create"), "chat"),
    ChainPattern("anthropic", ("messages", "stream"), "stream"),
    # Gemini
    ChainPattern("gemini", ("generate_content",), "chat"),
    ChainPattern("gemini", ("send_message",), "chat"),
    # Cohere
    ChainPattern("cohere", ("chat",), "chat"),
    ChainPattern("cohere", ("generate",), "completion"),
    ChainPattern("cohere", ("embed",), "embedding"),
    ChainPattern("cohere", ("rerank",), "chat"),
    # LangChain / LlamaIndex — handled separately via constructor map
)

# Constructor names → SDK label. When a variable is bound to a call of one of
# these, subsequent `.invoke` / `.ainvoke` / `.stream` / `.predict` on that
# variable are attributed to the matching SDK.
CONSTRUCTOR_SDK: dict[str, str] = {
    "ChatOpenAI": "langchain",
    "ChatAnthropic": "langchain",
    "ChatGoogleGenerativeAI": "langchain",
    "ChatCohere": "langchain",
    "ChatOllama": "langchain",
    "AzureChatOpenAI": "langchain",
    "OpenAI": "openai",
    "AsyncOpenAI": "openai",
    "Anthropic": "anthropic",
    "AsyncAnthropic": "anthropic",
    "AnthropicBedrock": "anthropic",
    "AnthropicVertex": "anthropic",
    "CohereClient": "cohere",
    "GenerativeModel": "gemini",
    # LlamaIndex
    "LLMPredictor": "llamaindex",
}

# Language-derived .invoke / .stream / .predict / .ainvoke suffixes — attributed
# to whatever constructor their receiver was bound to (or langchain if unknown).
INVOCATION_ATTRS = {"invoke", "ainvoke", "stream", "astream", "predict", "apredict", "batch", "abatch"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _flatten_attr_chain(node: ast.AST) -> list[str]:
    """Return the attribute chain as a list, e.g. `a.b.c.d` → ['a','b','c','d']."""
    parts: list[str] = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    elif isinstance(cur, ast.Call):
        # e.g. OpenAI().chat.completions.create — attribute the call to the constructor
        func = cur.func
        if isinstance(func, ast.Name):
            parts.append(func.id)
        elif isinstance(func, ast.Attribute):
            parts.extend(_flatten_attr_chain(func))
    parts.reverse()
    return parts


def _match_chain(chain: list[str]) -> Optional[ChainPattern]:
    """Find the first ChainPattern whose suffix matches the end of `chain`."""
    for pat in CHAIN_PATTERNS:
        k = len(pat.suffix)
        if len(chain) >= k and tuple(chain[-k:]) == pat.suffix:
            return pat
    return None


def _get_kwarg(call: ast.Call, name: str) -> Optional[ast.expr]:
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _const_string(node: Optional[ast.expr]) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _const_int(node: Optional[ast.expr]) -> Optional[int]:
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    return None


# ---------------------------------------------------------------------------
# Main visitor
# ---------------------------------------------------------------------------

@dataclass
class _Detector(ast.NodeVisitor):
    file_path: str
    source_lines: list[str]
    # var_name → canonical SDK (from constructor assignments)
    var_sdk: dict[str, str] = field(default_factory=dict)
    # var_name → extracted model string (from ChatOpenAI(model="...") constructors)
    var_model: dict[str, str] = field(default_factory=dict)
    # name → string value (walked first-pass from top-level Assign/AnnAssign)
    name_strings: dict[str, str] = field(default_factory=dict)
    loop_depth: int = 0
    calls: list[DetectedCall] = field(default_factory=list)

    # ---- loop tracking ----
    def visit_For(self, node: ast.For):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_AsyncFor(self, node: ast.AsyncFor):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_While(self, node: ast.While):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_ListComp(self, node: ast.ListComp):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_SetComp(self, node: ast.SetComp):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_DictComp(self, node: ast.DictComp):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        self.loop_depth += 1
        self.generic_visit(node)
        self.loop_depth -= 1

    # ---- variable binding (pre-pass) ----
    def collect_bindings(self, tree: ast.AST):
        """Walk assignments once to build name→string and var→SDK/model maps."""
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and len(node.targets) == 1:
                tgt = node.targets[0]
                if not isinstance(tgt, ast.Name):
                    continue
                name = tgt.id
                # name -> literal string?
                s = _const_string(node.value)
                if s is not None:
                    self.name_strings[name] = s
                # name -> constructor call?
                if isinstance(node.value, ast.Call):
                    ctor_name = None
                    if isinstance(node.value.func, ast.Name):
                        ctor_name = node.value.func.id
                    elif isinstance(node.value.func, ast.Attribute):
                        ctor_name = node.value.func.attr
                    if ctor_name and ctor_name in CONSTRUCTOR_SDK:
                        self.var_sdk[name] = CONSTRUCTOR_SDK[ctor_name]
                        # Try to pull model= kwarg for later attribution
                        model_kw = _get_kwarg(node.value, "model") or _get_kwarg(node.value, "model_name")
                        if model_kw is not None:
                            literal = _const_string(model_kw)
                            if literal:
                                self.var_model[name] = literal
                            elif isinstance(model_kw, ast.Name) and model_kw.id in self.name_strings:
                                self.var_model[name] = self.name_strings[model_kw.id]

    # ---- the matching logic ----
    def visit_Call(self, node: ast.Call):
        self.generic_visit(node)

        func = node.func
        if isinstance(func, ast.Attribute):
            chain = _flatten_attr_chain(func)
        elif isinstance(func, ast.Name):
            chain = [func.id]
        else:
            return

        sdk: Optional[str] = None
        call_type = "chat"
        model_hint: Optional[str] = None

        # 1. Direct constructor call (e.g. `llm = ChatOpenAI(model="gpt-4o")`)
        #    — skip unless the SDK makes this the actual "call site" (none do).
        if len(chain) == 1 and chain[0] in CONSTRUCTOR_SDK:
            return

        # 2. Invocation on a variable we bound to a constructor earlier
        if isinstance(func, ast.Attribute) and func.attr in INVOCATION_ATTRS:
            recv = func.value
            if isinstance(recv, ast.Name) and recv.id in self.var_sdk:
                sdk = self.var_sdk[recv.id]
                call_type = "stream" if func.attr in {"stream", "astream"} else "chat"
                model_hint = self.var_model.get(recv.id)

        # 3. Fall through to chain patterns
        if sdk is None:
            pat = _match_chain(chain)
            if pat is not None:
                sdk = pat.sdk
                call_type = pat.call_type

        if sdk is None:
            return

        # ---- kwarg extraction ----
        # model=
        if model_hint is None:
            kw = _get_kwarg(node, "model") or _get_kwarg(node, "model_name") or _get_kwarg(node, "deployment")
            if kw is not None:
                literal = _const_string(kw)
                if literal:
                    model_hint = literal
                elif isinstance(kw, ast.Name) and kw.id in self.name_strings:
                    model_hint = self.name_strings[kw.id]

        resolved_model_id = resolve_model_id(model_hint)

        # max_tokens cap
        max_out_node = (
            _get_kwarg(node, "max_tokens")
            or _get_kwarg(node, "max_completion_tokens")
            or _get_kwarg(node, "max_output_tokens")
            or _get_kwarg(node, "maxTokens")
        )
        max_output_tokens = _const_int(max_out_node)

        # stream
        stream_node = _get_kwarg(node, "stream")
        if isinstance(stream_node, ast.Constant) and stream_node.value is True:
            call_type = "stream"

        # Messages / prompt / input extraction
        extracted_text, has_vision = self._extract_prompt_text(node)

        # Task inference
        task_hint_source = extracted_text or " ".join(chain)
        task_type = _infer_task_type(task_hint_source, call_type)

        # Tokens
        if extracted_text:
            input_tokens = estimate_tokens(
                extracted_text, is_code=False, resolved_model_id=resolved_model_id
            )
            # Don't let a truly short literal collapse below the task default
            input_tokens = max(input_tokens, default_input_tokens(task_type) // 4)
        else:
            input_tokens = default_input_tokens(task_type)

        if has_vision:
            input_tokens += VISION_INPUT_BUMP

        output_tokens = default_output_tokens(task_type)
        if max_output_tokens is not None:
            output_tokens = min(output_tokens, max_output_tokens)

        # Loop / multiplier
        in_loop = self.loop_depth > 0
        multiplier = LOOP_MULTIPLIER_DEFAULT if in_loop else 1

        actual_cost = _actual_cost(input_tokens, output_tokens, resolved_model_id)
        if actual_cost is not None:
            actual_cost *= multiplier

        line_number = getattr(node, "lineno", 1)
        raw_match = ""
        if 0 < line_number <= len(self.source_lines):
            raw_match = self.source_lines[line_number - 1].strip()[:200]

        self.calls.append(DetectedCall(
            id=str(uuid.uuid4()),
            file_path=self.file_path,
            line_number=line_number,
            sdk=sdk,
            model_hint=model_hint,
            resolved_model_id=resolved_model_id,
            task_type=task_type,
            call_type=call_type,
            estimated_input_tokens=input_tokens,
            estimated_output_tokens=output_tokens,
            actual_cost_usd=round(actual_cost, 6) if actual_cost is not None else None,
            prompt_snippet=(extracted_text or "")[:300] or None,
            raw_match=raw_match,
            in_loop=in_loop,
            call_multiplier=multiplier,
            has_vision=has_vision,
            max_output_tokens=max_output_tokens,
            detection_method="ast",
        ))

    def _extract_prompt_text(self, call: ast.Call) -> tuple[str, bool]:
        """
        Pull whatever text content we can reach from this call's kwargs.
        Returns (concatenated_text, has_vision_flag).
        """
        parts: list[str] = []
        has_vision = False

        # messages=[{role, content: str | list[parts]}]
        msgs = _get_kwarg(call, "messages")
        if isinstance(msgs, ast.List):
            for elt in msgs.elts:
                if not isinstance(elt, ast.Dict):
                    continue
                for k, v in zip(elt.keys, elt.values):
                    key_str = _const_string(k)
                    if key_str != "content":
                        continue
                    s = _const_string(v)
                    if s:
                        parts.append(s)
                    elif isinstance(v, ast.List):
                        for sub in v.elts:
                            if not isinstance(sub, ast.Dict):
                                continue
                            sub_map = {}
                            for sk, sv in zip(sub.keys, sub.values):
                                sk_str = _const_string(sk)
                                if sk_str:
                                    sub_map[sk_str] = sv
                            t = _const_string(sub_map.get("type"))
                            if t in ("image_url", "image", "input_image"):
                                has_vision = True
                            text = _const_string(sub_map.get("text"))
                            if text:
                                parts.append(text)

        # system=
        sys_kw = _get_kwarg(call, "system")
        s = _const_string(sys_kw)
        if s:
            parts.append(s)
        elif isinstance(sys_kw, ast.List):
            # Anthropic sometimes takes system as a list of blocks
            for elt in sys_kw.elts:
                if isinstance(elt, ast.Dict):
                    for k, v in zip(elt.keys, elt.values):
                        if _const_string(k) == "text":
                            tv = _const_string(v)
                            if tv:
                                parts.append(tv)

        # prompt= (legacy completions / generate)
        prompt_kw = _get_kwarg(call, "prompt")
        s = _const_string(prompt_kw)
        if s:
            parts.append(s)

        # input= (embeddings)
        input_kw = _get_kwarg(call, "input")
        s = _const_string(input_kw)
        if s:
            parts.append(s)

        # contents= (Gemini)
        contents_kw = _get_kwarg(call, "contents")
        s = _const_string(contents_kw)
        if s:
            parts.append(s)

        # Positional argument 0 for simple `.invoke("...")` / `.generate_content("...")`
        if not parts and call.args:
            s = _const_string(call.args[0])
            if s:
                parts.append(s)

        return " ".join(parts).strip(), has_vision


# ---------------------------------------------------------------------------
# Task type + cost helpers (shared with regex path)
# ---------------------------------------------------------------------------

import re as _re  # local import to avoid polluting module namespace

_TASK_KEYWORDS = [
    ("summarization", _re.compile(r"summariz|tldr|brief|condense|shorten", _re.I)),
    ("classification", _re.compile(r"classif|categor|label|sentiment|intent", _re.I)),
    ("rag", _re.compile(r"retriev|document|context|chunk|vector|search|passage|knowledge", _re.I)),
    ("coding", _re.compile(r"\bcode\b|function|implement|debug|refactor|program|script", _re.I)),
    ("reasoning", _re.compile(r"reason|step.by.step|chain.of.thought|solve|analyz|think", _re.I)),
    ("embedding", _re.compile(r"embed|embedding", _re.I)),
]


def _infer_task_type(text: str, call_type: str) -> str:
    if call_type == "embedding":
        return "embedding"
    for task, pat in _TASK_KEYWORDS:
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


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def scan_python_file(file_path: str, content: str) -> Optional[List[DetectedCall]]:
    """
    AST-scan a Python file. Returns None if ast.parse() raises (caller should
    fall back to the regex detector); otherwise returns the list of calls
    (which may be empty).
    """
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return None
    detector = _Detector(file_path=file_path, source_lines=content.splitlines())
    detector.collect_bindings(tree)
    detector.visit(tree)
    return detector.calls
