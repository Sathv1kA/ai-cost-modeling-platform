// Fixture: OpenAI TS client, multi-line call, max_tokens cap
import OpenAI from "openai";

const client = new OpenAI();
const MODEL = "gpt-4o-mini";

export async function summarize(text: string) {
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Summarize in one sentence." },
      { role: "user", content: text },
    ],
    max_tokens: 120,
  });
  return resp.choices[0].message.content;
}
