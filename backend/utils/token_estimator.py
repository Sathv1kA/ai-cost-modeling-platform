"""
Heuristic token estimators. No external tokenizer dependency.
Accuracy: ±30% — good enough for cost modeling.
"""

OUTPUT_TOKEN_DEFAULTS = {
    "summarization": 300,
    "classification": 20,
    "rag": 500,
    "coding": 800,
    "reasoning": 1000,
    "chat": 400,
    "embedding": 0,
    "unknown": 300,
}

INPUT_TOKEN_DEFAULTS = {
    "summarization": 2000,
    "classification": 500,
    "rag": 4000,
    "coding": 2000,
    "reasoning": 1500,
    "chat": 800,
    "embedding": 512,
    "unknown": 1000,
}


def estimate_tokens(text: str, is_code: bool = False) -> int:
    """Estimate token count from raw text (1 token ≈ 3 chars for code, 4 for prose)."""
    chars_per_token = 3 if is_code else 4
    return max(1, len(text) // chars_per_token)


def default_input_tokens(task_type: str) -> int:
    return INPUT_TOKEN_DEFAULTS.get(task_type, INPUT_TOKEN_DEFAULTS["unknown"])


def default_output_tokens(task_type: str) -> int:
    return OUTPUT_TOKEN_DEFAULTS.get(task_type, OUTPUT_TOKEN_DEFAULTS["unknown"])
