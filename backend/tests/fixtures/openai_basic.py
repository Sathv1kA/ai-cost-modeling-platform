"""Fixture: simple OpenAI chat call with explicit model + max_tokens."""
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a concise assistant."},
        {"role": "user", "content": "Summarize the news briefly."},
    ],
    max_tokens=200,
)
print(response.choices[0].message.content)
