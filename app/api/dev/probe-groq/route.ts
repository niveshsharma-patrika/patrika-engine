import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

export const dynamic = "force-dynamic";

const CANDIDATES = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "deepseek-r1-distill-llama-70b",
  "moonshotai/kimi-k2-instruct-0905",
  "llama-3.3-70b-versatile",
];

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY missing" });

  const groq = createGroq({ apiKey });
  const results: Record<string, string> = {};

  for (const modelKey of CANDIDATES) {
    try {
      const { text, usage } = await generateText({
        model: groq(modelKey),
        prompt: 'Reply with the single word: ok',
      });
      results[modelKey] = `WORKS · ${(usage?.inputTokens ?? 0)}in/${(usage?.outputTokens ?? 0)}out · "${text.trim().slice(0, 40)}"`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results[modelKey] = `FAIL · ${msg.slice(0, 120)}`;
    }
  }
  return Response.json(results);
}
