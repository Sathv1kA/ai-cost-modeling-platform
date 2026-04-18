// Fixture: Google Gemini JS SDK, generateContent in a for-of loop
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export async function summarizeAll(texts: string[]) {
  const out: string[] = [];
  for (const t of texts) {
    const result = await model.generateContent(t);
    out.push(result.response.text());
  }
  return out;
}
