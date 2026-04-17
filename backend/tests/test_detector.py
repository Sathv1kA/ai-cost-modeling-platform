"""
Detector tests.

These are fixture-driven: each .py / .ts / .js file in tests/fixtures/ is run
through the dispatcher and we assert on the resulting DetectedCall list.

Goal is to lock in behavior across both the AST (Python) and regex (JS/TS)
paths: SDK attribution, model resolution, loop/vision flags, max_tokens
extraction, and method selection (`detection_method`).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from services.detector import scan_file

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> tuple[str, str]:
    path = FIXTURES / name
    return str(path), path.read_text()


def _scan(name: str):
    path, content = _load(name)
    # Use a stable virtual path so the test assertions aren't OS-specific
    return scan_file(name, content)


# ---------------------------------------------------------------------------
# Python / AST path
# ---------------------------------------------------------------------------

def test_openai_basic_ast():
    calls = _scan("openai_basic.py")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "openai"
    assert c.detection_method == "ast"
    assert c.model_hint == "gpt-4o"
    assert c.resolved_model_id == "gpt-4o"
    assert c.max_output_tokens == 200
    assert c.in_loop is False
    assert c.call_multiplier == 1
    assert c.has_vision is False
    # output cap should clamp the default task output
    assert c.estimated_output_tokens <= 200
    # messages were extracted → prompt_snippet non-empty
    assert c.prompt_snippet and "Summarize" in c.prompt_snippet


def test_anthropic_loop_ast():
    calls = _scan("anthropic_loop.py")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "anthropic"
    assert c.resolved_model_id == "claude-3-5-sonnet"
    assert c.in_loop is True
    assert c.call_multiplier > 1
    assert c.max_output_tokens == 500


def test_vision_ast():
    calls = _scan("vision_call.py")
    assert len(calls) == 1
    c = calls[0]
    assert c.has_vision is True
    assert c.sdk == "openai"
    assert c.resolved_model_id == "gpt-4o-mini"


def test_langchain_ctor_ast():
    calls = _scan("langchain_ctor.py")
    # Should detect the .invoke call, NOT the ChatOpenAI constructor as a separate site
    invoke_calls = [c for c in calls if "invoke" in c.raw_match]
    assert len(invoke_calls) == 1
    c = invoke_calls[0]
    assert c.sdk == "langchain"
    # Model should be inherited from the ChatOpenAI(model=...) kwarg
    assert c.resolved_model_id == "gpt-4o-mini"


def test_name_ref_resolves():
    calls = _scan("name_ref.py")
    assert len(calls) == 1
    c = calls[0]
    # MODEL = "gpt-4o" → model=MODEL should trace back to "gpt-4o"
    assert c.model_hint == "gpt-4o"
    assert c.resolved_model_id == "gpt-4o"


# ---------------------------------------------------------------------------
# JS / TS / regex path
# ---------------------------------------------------------------------------

def test_openai_ts_regex():
    calls = _scan("openai_ts.ts")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "openai"
    assert c.detection_method == "regex"
    # MODEL const → gpt-4o-mini
    assert c.resolved_model_id == "gpt-4o-mini"
    assert c.max_output_tokens == 120
    assert c.in_loop is False


def test_langchain_js_map_loop():
    calls = _scan("langchain_js.js")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "langchain"
    # The .invoke is inside docs.map(...) → should be flagged in_loop
    assert c.in_loop is True
    assert c.call_multiplier > 1


# ---------------------------------------------------------------------------
# Sanity: plain Python with no LLM calls returns []
# ---------------------------------------------------------------------------

def test_no_calls():
    calls = scan_file("plain.py", "x = 1\nprint(x)\n")
    assert calls == []


def test_syntax_error_falls_back_to_regex():
    # Intentionally bad Python — AST raises, regex path runs.
    bad = "from openai import OpenAI\nclient.chat.completions.create(\n  model='gpt-4o'  # missing paren\n"
    calls = scan_file("broken.py", bad)
    # Regex path should still detect the trigger
    assert any(c.sdk == "openai" for c in calls)
    assert all(c.detection_method == "regex" for c in calls)
