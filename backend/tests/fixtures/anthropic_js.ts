// Fixture: Anthropic JS SDK, messages.create with max_tokens
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function ask(prompt: string) {
  const msg = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content;
}
