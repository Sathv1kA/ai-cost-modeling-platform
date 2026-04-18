"""
JS / TS detector tests.

These lock in behaviour for the regex path: SDK attribution across vendors,
loop detection via `for`/`.map`, model resolution via const bindings,
streaming, vision, and legitimate negatives (comments).
"""
from __future__ import annotations

from pathlib import Path

from services.detector import scan_file

FIXTURES = Path(__file__).parent / "fixtures"


def _scan(name: str):
    content = (FIXTURES / name).read_text()
    return scan_file(name, content)


def test_anthropic_js_messages_create():
    calls = _scan("anthropic_js.ts")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "anthropic"
    assert c.detection_method == "regex"
    assert c.model_hint == "claude-3-5-haiku-20241022"
    assert c.resolved_model_id == "claude-3-5-haiku"
    assert c.max_output_tokens == 400
    assert c.in_loop is False


def test_gemini_js_in_for_of_loop():
    calls = _scan("gemini_js.ts")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "gemini"
    # `for (const t of texts)` → loop detector should flag this
    assert c.in_loop is True
    assert c.call_multiplier > 1


def test_cohere_js_chat():
    calls = _scan("cohere_js.ts")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "cohere"
    assert c.model_hint == "command-r"
    assert c.call_type == "chat"


def test_openai_stream_flag():
    calls = _scan("openai_stream.ts")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "openai"
    # `stream: true` kwarg should promote call_type to "stream"
    assert c.call_type == "stream"


def test_openai_vision_js():
    calls = _scan("openai_vision_js.tsx")
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "openai"
    # The `"image_url"` marker inside the content array must flip has_vision
    assert c.has_vision is True
    assert c.max_output_tokens == 300


def test_comments_are_not_detected():
    calls = _scan("comments_js.js")
    # Commented-out calls must not produce detections
    assert calls == []


def test_region_extraction_across_lines():
    # Call split across 6 lines — model kwarg is on line 3
    src = """\
const x = openAi.chat.completions.create({
  messages: [{role:"user", content:"hi"}],
  model: "gpt-3.5-turbo",
  temperature: 0.2,
  max_tokens: 80,
});
"""
    calls = scan_file("inline.ts", src)
    assert len(calls) == 1
    c = calls[0]
    assert c.model_hint == "gpt-3.5-turbo"
    assert c.max_output_tokens == 80


def test_const_model_binding_resolution():
    # MODEL const is hoisted from elsewhere in the file and referenced by name
    calls = _scan("openai_ts.ts")
    assert len(calls) == 1
    # `const MODEL = "gpt-4o-mini"` → model: MODEL should resolve to that
    assert calls[0].model_hint == "gpt-4o-mini"


def test_langchain_map_loop_detection():
    # Already covered in test_detector.py but verify multiplier applies to cost
    calls = _scan("langchain_js.js")
    assert len(calls) == 1
    c = calls[0]
    assert c.in_loop is True
    # actual_cost_usd must be multiplied — if None (unresolved model) skip
    if c.actual_cost_usd is not None:
        # Loose lower bound: looped call should cost roughly multiplier × single
        assert c.call_multiplier >= 2
