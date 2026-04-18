"""
Dispatch layer for LLM call detection.

Python files are parsed with the AST detector (precise kwarg extraction).
Everything else — JS / TS / JSX / TSX / mjs / notebook-extracted code — is
scanned with the enhanced regex detector.

When the AST detector fails (syntax errors, Py2 code, unparseable notebook
cells), we fall back to the regex detector so we still get *some* signal.
"""
from __future__ import annotations

from typing import List

from models.schemas import DetectedCall
from services.js_detector import scan_js_file
from services.python_detector import scan_python_file


def scan_file(file_path: str, content: str) -> List[DetectedCall]:
    # Jupyter notebooks are fetched with their code cells already concatenated
    # into a Python-ish blob by github_client._extract_notebook_code. Try the
    # AST detector first — most notebook code is valid Python.
    if file_path.endswith((".py", ".ipynb")):
        ast_calls = scan_python_file(file_path, content)
        if ast_calls is not None:
            return ast_calls
        # Parse failed — fall through to regex path
    return scan_js_file(file_path, content)


def scan_all_files(files: list) -> List[DetectedCall]:
    """files: list of {"path": str, "content": str}"""
    all_calls: List[DetectedCall] = []
    for f in files:
        all_calls.extend(scan_file(f["path"], f["content"]))
    return all_calls
