// Fixture: Cohere JS SDK chat call
import { CohereClient } from "cohere-ai";

const co = new CohereClient({ token: process.env.COHERE_KEY! });

export async function classify(text: string) {
  const resp = await co.chat({
    model: "command-r",
    message: `Classify the sentiment of this review: ${text}`,
  });
  return resp.text;
}
