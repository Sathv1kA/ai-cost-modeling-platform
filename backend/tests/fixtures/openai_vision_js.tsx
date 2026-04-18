// Fixture: OpenAI vision call — has_vision flag should be true
import OpenAI from "openai";

const client = new OpenAI();

export async function describeImage(url: string) {
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
    max_tokens: 300,
  });
  return resp.choices[0].message.content;
}
