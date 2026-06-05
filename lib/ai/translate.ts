import { generateText } from "ai";

import { getModelFor } from "./provider";

/**
 * In-memory translation cache. Keyed by English source string.
 * Resets on server restart — fine because Groq Llama 3.3 70B is fast + free.
 */
const cache = new Map<string, string>();

/**
 * Batch-translate English news headlines/snippets to Hindi (Devanagari)
 * using the configured "summary" model. Falls back to original text on failure.
 */
export async function translateToHindi(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const result: string[] = new Array(texts.length);
  const uncached: { idx: number; text: string }[] = [];

  texts.forEach((t, i) => {
    const cleaned = (t ?? "").trim();
    if (!cleaned) {
      result[i] = "";
      return;
    }
    const hit = cache.get(cleaned);
    if (hit) result[i] = hit;
    else uncached.push({ idx: i, text: cleaned });
  });

  if (uncached.length === 0) return result;

  const resolved = await getModelFor("summary");
  if (!resolved) {
    uncached.forEach(({ idx, text }) => (result[idx] = text));
    return result;
  }

  const prompt = `Translate each numbered news headline below to Hindi (Devanagari script).
Rules:
- Keep social handles like @MumbaiPolice exactly as-is.
- Keep brand / outlet names but transliterate to Devanagari if natural.
- Don't add commentary, don't expand the sentence.
- Return ONLY a JSON array of strings in the SAME ORDER. No preamble, no markdown.

${uncached.map((u, i) => `${i + 1}. ${u.text}`).join("\n")}`;

  try {
    const { text } = await generateText({
      model: resolved.model,
      prompt,
      temperature: 0.1,
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (Array.isArray(arr)) {
        uncached.forEach(({ idx, text: en }, j) => {
          const hi = typeof arr[j] === "string" ? (arr[j] as string) : en;
          cache.set(en, hi);
          result[idx] = hi;
        });
        return result;
      }
    }
  } catch {
    /* fall through to plain-text fallback below */
  }

  uncached.forEach(({ idx, text }) => (result[idx] = text));
  return result;
}
