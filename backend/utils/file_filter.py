import re
from typing import List

ALLOWED_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".ipynb"}

EXCLUDED_PATTERNS: List[re.Pattern] = [
    re.compile(r"node_modules/"),
    re.compile(r"\.venv/"),
    re.compile(r"\bvenv/"),
    re.compile(r"\.git/"),
    re.compile(r"\bdist/"),
    re.compile(r"\bbuild/"),
    re.compile(r"__pycache__/"),
    re.compile(r"\.pytest_cache/"),
    re.compile(r"\.mypy_cache/"),
    re.compile(r"\.next/"),
    re.compile(r"\.nuxt/"),
    re.compile(r"coverage/"),
    re.compile(r"\.tox/"),
]

MAX_FILE_SIZE_BYTES = 500_000


def should_scan_file(path: str, size: int = 0) -> bool:
    if size > MAX_FILE_SIZE_BYTES:
        return False
    dot = path.rfind(".")
    if dot == -1:
        return False
    ext = path[dot:]
    if ext not in ALLOWED_EXTENSIONS:
        return False
    return not any(p.search(path) for p in EXCLUDED_PATTERNS)
