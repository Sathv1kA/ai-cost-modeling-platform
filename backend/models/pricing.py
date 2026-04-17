from dataclasses import dataclass, field
from typing import List


@dataclass
class ModelPricing:
    id: str
    display_name: str
    provider: str  # "openai" | "anthropic" | "google" | "groq" | "mistral" | "cohere"
    context_window: int
    input_price_per_mtoken: float   # USD per 1M input tokens
    output_price_per_mtoken: float  # USD per 1M output tokens
    strengths: List[str] = field(default_factory=list)  # task types this model excels at
    quality_tier: str = "mid"       # "budget" | "mid" | "premium"
    supports_vision: bool = False
    supports_function_calling: bool = True


MODEL_PRICING: List[ModelPricing] = [
    # --- OpenAI ---
    ModelPricing(
        id="gpt-4o",
        display_name="GPT-4o",
        provider="openai",
        context_window=128_000,
        input_price_per_mtoken=2.50,
        output_price_per_mtoken=10.00,
        strengths=["coding", "reasoning", "rag", "chat"],
        quality_tier="premium",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="gpt-4o-mini",
        display_name="GPT-4o Mini",
        provider="openai",
        context_window=128_000,
        input_price_per_mtoken=0.15,
        output_price_per_mtoken=0.60,
        strengths=["classification", "summarization", "chat"],
        quality_tier="budget",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="gpt-4-turbo",
        display_name="GPT-4 Turbo",
        provider="openai",
        context_window=128_000,
        input_price_per_mtoken=10.00,
        output_price_per_mtoken=30.00,
        strengths=["reasoning", "coding"],
        quality_tier="premium",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="gpt-3.5-turbo",
        display_name="GPT-3.5 Turbo",
        provider="openai",
        context_window=16_385,
        input_price_per_mtoken=0.50,
        output_price_per_mtoken=1.50,
        strengths=["chat", "summarization"],
        quality_tier="budget",
        supports_vision=False,
        supports_function_calling=True,
    ),
    # --- Anthropic ---
    ModelPricing(
        id="claude-3-5-sonnet",
        display_name="Claude 3.5 Sonnet",
        provider="anthropic",
        context_window=200_000,
        input_price_per_mtoken=3.00,
        output_price_per_mtoken=15.00,
        strengths=["coding", "reasoning", "rag", "summarization"],
        quality_tier="premium",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="claude-3-haiku",
        display_name="Claude 3 Haiku",
        provider="anthropic",
        context_window=200_000,
        input_price_per_mtoken=0.25,
        output_price_per_mtoken=1.25,
        strengths=["classification", "summarization", "chat"],
        quality_tier="budget",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="claude-3-opus",
        display_name="Claude 3 Opus",
        provider="anthropic",
        context_window=200_000,
        input_price_per_mtoken=15.00,
        output_price_per_mtoken=75.00,
        strengths=["reasoning", "coding"],
        quality_tier="premium",
        supports_vision=True,
        supports_function_calling=True,
    ),
    # --- Google ---
    ModelPricing(
        id="gemini-1.5-pro",
        display_name="Gemini 1.5 Pro",
        provider="google",
        context_window=1_000_000,
        input_price_per_mtoken=1.25,
        output_price_per_mtoken=5.00,
        strengths=["rag", "summarization", "reasoning"],
        quality_tier="premium",
        supports_vision=True,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="gemini-1.5-flash",
        display_name="Gemini 1.5 Flash",
        provider="google",
        context_window=1_000_000,
        input_price_per_mtoken=0.075,
        output_price_per_mtoken=0.30,
        strengths=["classification", "summarization", "chat"],
        quality_tier="budget",
        supports_vision=True,
        supports_function_calling=True,
    ),
    # --- Groq (Llama 3) ---
    ModelPricing(
        id="llama-3-70b-groq",
        display_name="Llama 3 70B (Groq)",
        provider="groq",
        context_window=8_192,
        input_price_per_mtoken=0.59,
        output_price_per_mtoken=0.79,
        strengths=["coding", "chat", "summarization"],
        quality_tier="mid",
        supports_vision=False,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="llama-3-8b-groq",
        display_name="Llama 3 8B (Groq)",
        provider="groq",
        context_window=8_192,
        input_price_per_mtoken=0.05,
        output_price_per_mtoken=0.08,
        strengths=["classification", "chat"],
        quality_tier="budget",
        supports_vision=False,
        supports_function_calling=False,
    ),
    # --- Mistral ---
    ModelPricing(
        id="mistral-large",
        display_name="Mistral Large",
        provider="mistral",
        context_window=32_768,
        input_price_per_mtoken=2.00,
        output_price_per_mtoken=6.00,
        strengths=["coding", "reasoning"],
        quality_tier="mid",
        supports_vision=False,
        supports_function_calling=True,
    ),
    ModelPricing(
        id="mistral-7b",
        display_name="Mistral 7B",
        provider="mistral",
        context_window=32_768,
        input_price_per_mtoken=0.025,
        output_price_per_mtoken=0.025,
        strengths=["classification", "chat"],
        quality_tier="budget",
        supports_vision=False,
        supports_function_calling=False,
    ),
    # --- Cohere ---
    ModelPricing(
        id="command-r-plus",
        display_name="Command R+",
        provider="cohere",
        context_window=128_000,
        input_price_per_mtoken=2.50,
        output_price_per_mtoken=10.00,
        strengths=["rag", "summarization"],
        quality_tier="mid",
        supports_vision=False,
        supports_function_calling=True,
    ),
]

MODEL_PRICING_MAP = {m.id: m for m in MODEL_PRICING}
