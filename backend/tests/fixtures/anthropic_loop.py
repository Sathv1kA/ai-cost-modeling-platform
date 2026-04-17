"""Fixture: Anthropic call inside a for-loop (should be flagged in_loop)."""
import anthropic

client = anthropic.Anthropic()
docs = ["doc1", "doc2", "doc3"]

for doc in docs:
    msg = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=500,
        messages=[{"role": "user", "content": f"Summarize: {doc}"}],
    )
    print(msg.content)
