// Fixture: OpenAI streaming call — should set call_type="stream"
import OpenAI from "openai";

const client = new OpenAI();

export async function streamReply(q: string) {
  const s = await client.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [{ role: "user", content: q }],
  });
  for await (const chunk of s) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
