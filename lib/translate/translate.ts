import { generateObject, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getApiKey, getModelFor } from "@/lib/ai/provider";
import { splitHtml, joinHtml, mask, unmask, stripTags, escapeText, type Piece } from "./html";
import { checkPair, type Flag } from "./checks";

/**
 * Hindi → English translation of an editorial article, under news-accuracy
 * rules: translate only — never add, drop or soften facts, figures, names,
 * quotes or attribution. translateArticle() runs the instant deterministic
 * checks per paragraph (figures, leftover Hindi, size drift, markup);
 * reviewTranslation() is the independent AI review (each English paragraph vs
 * its Hindi source), run after the response so it doesn't add to the wait.
 * Findings are flags; nothing is silently "fixed".
 */

export type SourceArticle = { title: string; excerpt: string; content: string };
export type TranslatedArticle = { title: string; excerpt: string; content: string };
export type AlignedPair = { id: string; label: string; hi: string; en: string };
export type TranslationOutcome = {
  result: TranslatedArticle;
  flags: Flag[];
  model: string;
  pairs: AlignedPair[]; // for reviewTranslation()
};

const CHUNK_CHARS = 7000;   // Hindi HTML per translation call
const PARALLEL = 3;

const RULES = `You translate Hindi news articles written by Rajasthan Patrika's own editorial team into English for publication. You are a translator, not a writer.

STRICT RULES — accuracy over style:
1. Translate ONLY what the Hindi says. Do NOT add any fact, background, context, explanation, quote, number, date, designation or opinion that is not in the Hindi. Do NOT drop any sentence, fact, figure, name or attribution.
2. Figures stay exact: amounts, dates, times, ages, counts, percentages, distances. Write numbers in digits exactly as in the source (convert Devanagari digits ०–९ to 0–9). Keep Indian units: लाख → lakh, करोड़ → crore — never convert to million/billion and never recalculate anything.
3. Names of people, places, organisations, parties, schemes and posts: use their standard English spelling (transliterate names; translate designations, e.g. मुख्यमंत्री → Chief Minister). Never substitute a different person, guess a first name, or expand an abbreviation you are not sure of.
4. Quotes: translate quoted words faithfully inside quotation marks, attributed to the same speaker. Never turn reported speech into a quote or a quote into a paraphrase.
5. Keep certainty and attribution exactly: "पुलिस के अनुसार" → "according to police"; "बताया जा रहा है" → "reportedly"; "आरोप" → "alleged". Never turn a claim, allegation or possibility into a fact.
6. Style: clear, neutral Indian English news style. Indian terms (tehsil, panchayat, SHO, gram sabha …) may be kept. No sensational words, no added adjectives, no editorialising.
7. If something is unclear, translate it as literally as possible — never guess or fill gaps.
8. Units may contain markers like {{1}}, {{2}} — they stand for formatting (bold, links, line breaks). Keep EVERY marker exactly once, unchanged, around the matching translated words (a marker pair like {{3}}…{{4}} wraps the same words in English). Never add, remove, renumber or translate a marker.
9. Unit "t" is the headline: a faithful English headline of the Hindi title — no clickbait, nothing added. Unit "e" is the summary: translate it faithfully.
Return every unit id exactly once.`;

const UNITS_SCHEMA = z.object({ units: z.array(z.object({ id: z.string(), html: z.string() })) });
const REVIEW_SCHEMA = z.object({
  issues: z.array(z.object({
    unit: z.string(),
    type: z.string(),
    note: z.string(),
  })),
});

async function resolveModel(): Promise<{ model: LanguageModel; label: string }> {
  const openaiKey = await getApiKey("openai");
  if (openaiKey) {
    const label = process.env.TRANSLATE_MODEL ?? "gpt-4.1";
    return { model: createOpenAI({ apiKey: openaiKey })(label), label };
  }
  const m = await getModelFor("drafting");
  if (!m) throw new Error("No AI model configured.");
  return { model: m.model, label: m.modelKey };
}

type Unit = { id: string; html: string; label: string };

/** Pack units into calls of ~CHUNK_CHARS (a unit is never split). */
function chunk(units: Unit[]): Unit[][] {
  const out: Unit[][] = [];
  let cur: Unit[] = [];
  let size = 0;
  for (const u of units) {
    if (cur.length && size + u.html.length > CHUNK_CHARS) { out.push(cur); cur = []; size = 0; }
    cur.push(u); size += u.html.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function inBatches<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Proper names in the whole article, so every chunk spells them the same way. */
async function buildGlossary(model: LanguageModel, plain: string): Promise<string> {
  try {
    const { object } = await generateObject({
      model, temperature: 0, maxRetries: 1, abortSignal: AbortSignal.timeout(60_000),
      schema: z.object({ names: z.array(z.object({ hindi: z.string(), english: z.string() })) }),
      prompt: `List every proper name in this Hindi news article — people (with their designation), places, organisations, parties, schemes — with its standard English spelling. Only names that appear in the text; do not add any.\n\n${plain.slice(0, 14000)}`,
    });
    return object.names.slice(0, 80).map((n) => `${n.hindi} = ${n.english}`).join("\n");
  } catch {
    return ""; // consistency aid only — translation proceeds without it
  }
}

async function translateChunk(model: LanguageModel, units: Unit[], glossary: string): Promise<Map<string, string>> {
  const ask = async (list: Unit[]) => {
    const { object } = await generateObject({
      model, temperature: 0.1, maxRetries: 2, abortSignal: AbortSignal.timeout(150_000),
      schema: UNITS_SCHEMA,
      system: RULES,
      prompt: `${glossary ? `Use these English spellings for names:\n${glossary}\n\n` : ""}Translate each unit's "html" from Hindi to English. Return { "units": [{ "id", "html" }] }.\n\n${JSON.stringify(list.map((u) => ({ id: u.id, html: u.html })))}`,
    });
    return new Map(object.units.map((u) => [u.id, u.html.trim()]));
  };
  const got = await ask(units);
  // Anything the model skipped gets one more try on its own.
  const missing = units.filter((u) => !got.get(u.id));
  if (missing.length) {
    const again = await ask(missing).catch(() => new Map<string, string>());
    for (const [k, v] of again) if (v) got.set(k, v);
  }
  return got;
}

/** Independent AI review: compare each English paragraph with its Hindi source. */
async function reviewChunk(model: LanguageModel, pairs: AlignedPair[]): Promise<Flag[]> {
  const text = pairs.map((p) => `[${p.id}] (${p.label})\nHINDI: ${p.hi}\nENGLISH: ${p.en}`).join("\n\n");
  const { object } = await generateObject({
    model, temperature: 0, maxRetries: 2, abortSignal: AbortSignal.timeout(120_000),
    schema: REVIEW_SCHEMA,
    prompt: `You are a strict bilingual fact-checker for a newspaper. Compare each ENGLISH translation with its HINDI source and report ONLY real accuracy problems:
- "added": information in the English that is not in the Hindi (facts, context, adjectives that change meaning, opinions)
- "omitted": a fact, figure, name, quote or attribution in the Hindi that is missing from the English
- "changed": meaning, a number, a date, a name, a designation, who-said-what, or certainty (claim/allegation vs fact) differs
Do NOT report style, word choice, or acceptable paraphrase that keeps the same meaning. If a pair is accurate, report nothing for it. "note" must say exactly what differs, in English, in one sentence.

${text}`,
  });
  return object.issues
    .filter((i) => i.note.trim())
    .map((i) => {
      const type = ["added", "omitted", "changed"].includes(i.type) ? i.type : "changed";
      const label = pairs.find((p) => p.id === i.unit)?.label ?? i.unit;
      return { type: `review_${type}`, unit: i.unit, detail: `${label}: ${i.note.trim()}` };
    });
}

export async function translateArticle(src: SourceArticle): Promise<TranslationOutcome> {
  const { model, label } = await resolveModel();

  const plain = !/<[a-zA-Z!/]/.test(src.content);
  const pieces: Piece[] = splitHtml(src.content);
  const contentUnits = pieces.filter((p): p is Extract<Piece, { kind: "unit" }> => p.kind === "unit");
  const units: Unit[] = [
    ...(src.title.trim() ? [{ id: "t", html: src.title.trim(), label: "Title" }] : []),
    ...(src.excerpt.trim() ? [{ id: "e", html: src.excerpt.trim(), label: "Excerpt" }] : []),
    ...contentUnits.map((u, i) => ({ id: u.id, html: u.html, label: `Paragraph ${i + 1}` })),
  ];

  // The model sees markers instead of tags (see mask()).
  const masks = new Map(units.map((u) => [u.id, mask(u.html)]));
  const masked: Unit[] = units.map((u) => ({ ...u, html: masks.get(u.id)!.text }));

  const out = new Map<string, string>();
  if (units.length) {
    const chunks = chunk(masked);
    const glossary = chunks.length > 1 ? await buildGlossary(model, `${src.title}\n${stripTags(src.content)}`) : "";
    const maps = await inBatches(chunks, PARALLEL, (c) => translateChunk(model, c, glossary));
    for (const m of maps) for (const [k, v] of m) out.set(k, v);
  }

  const flags: Flag[] = [];
  // Coverage + markup. Put the original tags back in place of the markers; a
  // paragraph whose markers came back wrong is kept as plain text (its
  // bold/link dropped) rather than risk broken HTML on the page.
  for (const u of units) {
    const en = out.get(u.id);
    if (!en) {
      flags.push({ type: "untranslated", unit: u.id, detail: `${u.label}: could not be translated — the Hindi is kept in its place.` });
      continue;
    }
    const restored = unmask(en, masks.get(u.id)!.tags);
    if (u.id === "t" || u.id === "e") { out.set(u.id, stripTags(restored ?? en.replace(/\{\{\d+\}\}/g, ""))); continue; } // plain-text fields
    if (restored !== null) { out.set(u.id, restored); continue; }
    const text = stripTags(en.replace(/\{\{\d+\}\}/g, ""));
    out.set(u.id, plain ? text : escapeText(text));
    if (!plain) flags.push({ type: "formatting", unit: u.id, detail: `${u.label}: formatting (bold/links) could not be kept — check this paragraph.` });
  }

  // Instant deterministic checks on every aligned pair.
  const pairs: AlignedPair[] = units
    .filter((u) => out.has(u.id))
    .map((u) => ({ id: u.id, label: u.label, hi: stripTags(u.html), en: stripTags(out.get(u.id)!) }));
  for (const p of pairs) flags.push(...checkPair(p.id, p.label, p.hi, p.en));

  return {
    result: {
      title: src.title.trim() ? out.get("t") ?? src.title : "",
      excerpt: src.excerpt.trim() ? out.get("e") ?? src.excerpt : "",
      content: joinHtml(pieces, out),
    },
    flags,
    model: label,
    pairs,
  };
}

/** Independent AI accuracy review of a finished translation (added / omitted / changed). */
export async function reviewTranslation(pairs: AlignedPair[]): Promise<Flag[]> {
  if (pairs.length === 0) return [];
  const { model } = await resolveModel();
  const groups: AlignedPair[][] = [];
  let cur: AlignedPair[] = [];
  let size = 0;
  for (const p of pairs) {
    const len = p.hi.length + p.en.length;
    if (cur.length && size + len > CHUNK_CHARS * 2) { groups.push(cur); cur = []; size = 0; }
    cur.push(p); size += len;
  }
  if (cur.length) groups.push(cur);
  const reviewed = await inBatches(groups, PARALLEL, (g) =>
    reviewChunk(model, g).catch(() => [{ type: "review_unavailable", detail: "The automatic accuracy review could not run for part of this article — please check it manually." }] as Flag[])
  );
  return reviewed.flat();
}
