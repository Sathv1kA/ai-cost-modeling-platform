// Fixture: LangChain JS ChatAnthropic constructor + llm.invoke inside .map
import { ChatAnthropic } from "@langchain/anthropic";

const llm = new ChatAnthropic({ model: "claude-3-5-sonnet-20241022" });

export async function batchSummarize(docs) {
  const results = await Promise.all(
    docs.map(async (d) => {
      return await llm.invoke([
        { role: "user", content: `Summarize: ${d}` },
      ]);
    })
  );
  return results;
}
