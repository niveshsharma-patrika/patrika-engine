import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export const dynamic = "force-dynamic";

const CANDIDATES = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-0",
  "claude-3-5-sonnet-latest",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-latest",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
];

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY missing" });

  const anthropic = createAnthropic({
    apiKey,
    baseURL: "https://api.anthropic.com/v1",
  });
  const results: Record<string, string> = {};

  for (const modelKey of CANDIDATES) {
    try {
      const { text } = await generateText({
        model: anthropic(modelKey),
        prompt: 'Say "ok" and nothing else.',
      });
      results[modelKey] = `WORKS: ${text.trim().slice(0, 40)}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results[modelKey] = `FAIL: ${msg.slice(0, 100)}`;
    }
  }

  return Response.json(results);
}
