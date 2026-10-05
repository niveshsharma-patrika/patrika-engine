import { generateText } from "ai";

import { getModelFor } from "./provider";

/**
 * In-memory translation cache, keyed by English source string. BOUNDED: news
 * headlines are mostly unique each refresh, so an unbounded cache grows forever
 * and leaks memory (the ingest/ticker crons translate constantly). Cap it with
 * FIFO eviction — a translation is cheap to recompute, memory is not.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 2000;

function cacheSet(key: string, value: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value; // insertion order = oldest first
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

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
          cacheSet(en, hi);
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
