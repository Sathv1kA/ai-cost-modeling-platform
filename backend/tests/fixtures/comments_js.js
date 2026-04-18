// Fixture: commented-out calls must NOT be detected as call sites
import OpenAI from "openai";
const client = new OpenAI();

// client.chat.completions.create({ model: "gpt-4o" });
/* client.chat.completions.create({ model: "gpt-4o-mini" }); */

export function noop() {
  return 42;
}
