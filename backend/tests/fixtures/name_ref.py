"""Fixture: model= references a name, not a literal. Should resolve via var tracking."""
from openai import OpenAI

MODEL = "gpt-4o"
client = OpenAI()


def ask(question: str) -> str:
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": question}],
    )
    return resp.choices[0].message.content
