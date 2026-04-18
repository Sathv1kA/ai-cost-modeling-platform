"""
Notebook (.ipynb) handling tests.

Exercises the full path a real notebook takes: raw .ipynb JSON →
github_client._extract_notebook_code → detector.scan_file → DetectedCall.
"""
from __future__ import annotations

from pathlib import Path

from services.detector import scan_file
from services.github_client import _extract_notebook_code

FIXTURES = Path(__file__).parent / "fixtures"


def test_notebook_code_extraction_joins_code_cells():
    raw = (FIXTURES / "notebook_sample.ipynb").read_text()
    code = _extract_notebook_code(raw)
    # Should contain code from both code cells, skip the markdown prose
    assert "from openai import OpenAI" in code
    assert "chat.completions.create" in code
    assert "gpt-4o-mini" in code
    assert "Some prose about" not in code  # markdown cell is dropped


def test_notebook_call_is_detected_via_ast():
    raw = (FIXTURES / "notebook_sample.ipynb").read_text()
    code = _extract_notebook_code(raw)
    calls = scan_file("notebook_sample.ipynb", code)
    assert len(calls) == 1
    c = calls[0]
    assert c.sdk == "openai"
    # Notebook cells are Python → dispatcher should route to AST path
    assert c.detection_method == "ast"
    assert c.resolved_model_id == "gpt-4o-mini"
    assert c.max_output_tokens == 150


def test_notebook_malformed_falls_back_to_raw():
    # _extract_notebook_code returns the raw string when JSON parsing fails,
    # so a broken notebook still has a chance of being scanned by the regex path.
    broken = "{not valid json at all"
    code = _extract_notebook_code(broken)
    assert code == broken


def test_notebook_source_as_string_not_list():
    # Some tools write source as a single string, not a list of lines.
    nb_json = (
        '{"cells":['
        '{"cell_type":"code","source":"from openai import OpenAI\\nclient.chat.completions.create(model=\\"gpt-4o\\", messages=[])\\n"}'
        '],"nbformat":4,"nbformat_minor":5}'
    )
    code = _extract_notebook_code(nb_json)
    assert "chat.completions.create" in code
    calls = scan_file("single_str.ipynb", code)
    assert len(calls) == 1
    assert calls[0].sdk == "openai"
