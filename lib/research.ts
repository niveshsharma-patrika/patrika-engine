/**
 * Research tool — a writer describes an incident; we search the web for the same
 * and return what we found (summary / timeline / sources / angles), then write a
 * grounded article on request. Built on the same OpenAI web_search path as the
 * Patrika+ drafting (createOpenAI → openai.responses + openai.tools.webSearch).
 *
 * Stateless: nothing is persisted. Factual integrity first — only sourced facts,
 * never invented names/quotes/numbers.
 */
import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { getApiKey, getModelFor } from "@/lib/ai/provider";
import { stripCitations } from "@/lib/text/citations";
import { normalizeHindiTypography } from "@/lib/text/hindi";

export type Lang = "hi" | "en";
export type ResearchSource = { title: string; url: string; publisher: string };
export type TimelineEntry = { date: string; event: string };
export type ResearchResult = {
  summary: string;
  timeline: TimelineEntry[];
  angles: string[];
  unverified: string;
  sources: ResearchSource[];
  found: boolean;
};
export type ArticleResult = { headline: string; body: string };

const SEARCH_MODEL = process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o";

export const WORDS: Record<string, number> = { short: 250, standard: 500, detailed: 800 };

function nz(text: string, lang: Lang): string {
  return lang === "hi" ? normalizeHindiTypography(text) : text;
}

function todayIN(): string {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Real web-search citations → deduped, capped source list. */
function toSources(srcs: readonly unknown[] | undefined): ResearchSource[] {
  const seen = new Set<string>();
  const out: ResearchSource[] = [];
  for (const raw of srcs ?? []) {
    const s = raw as { url?: string; title?: string };
    const url = typeof s?.url === "string" ? s.url : "";
    if (!url || seen.has(url)) continue;
    // Only keep real web links (drop any javascript:/data:/unparseable URL before
    // it can be rendered as a clickable source).
    let publisher = "";
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      publisher = u.hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    seen.add(url);
    out.push({ title: String(s.title || publisher || url).slice(0, 200), url, publisher });
    if (out.length >= 12) break;
  }
  return out;
}

/** Step 1 — search the web for the incident and return what we found. */
export async function researchIncident(incident: string, lang: Lang): Promise<ResearchResult> {
  const openaiKey = await getApiKey("openai");
  if (!openaiKey) throw new Error("Web search isn't configured (no OpenAI key).");
  const openai = createOpenAI({ apiKey: openaiKey });
  const langName = lang === "hi" ? "Hindi" : "English";

  // Pass A — search + factual digest, with the real cited sources.
  const research = await generateText({
    model: openai.responses(SEARCH_MODEL),
    temperature: 0.3,
    maxOutputTokens: 1400,
    abortSignal: AbortSignal.timeout(90_000),
    tools: {
      web_search: openai.tools.webSearch({ searchContextSize: "high", userLocation: { type: "approximate", country: "IN" } }),
    },
    prompt: `You are a newsroom researcher for Patrika. A reporter describes an incident below. Search the web for credible coverage of THIS SAME incident and report what you find, in ${langName}.

Cover: what happened; who / where / when; key numbers and names; the CURRENT status or outcome as of ${todayIN()}. Explicitly note where sources CONFLICT or where a claim is thin / unverified. Use ONLY real, sourced facts from credible outlets — never invent names, quotes, numbers or dates. If you cannot find credible coverage of this specific incident, say so plainly and do not pad.

INCIDENT (reporter's account):
${incident}`,
  });
  const digest = stripCitations((research.text ?? "").trim());
  const sources = toSources(research.sources as readonly unknown[] | undefined);
  const found = sources.length > 0 || digest.length > 80;

  // Pass B — structure the digest (no web search). Facts only from the digest.
  let summary = nz(digest, lang);
  let timeline: TimelineEntry[] = [];
  let angles: string[] = [];
  let unverified = "";
  const model = await getModelFor("summary");
  if (model) {
    try {
      const { object } = await generateObject({
        model: model.model,
        temperature: 0.2,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(60_000),
        schema: z.object({
          summary: z.string(),
          timeline: z.array(z.object({ date: z.string(), event: z.string() })),
          angles: z.array(z.string()),
          unverified: z.string(),
        }),
        prompt: `From the research digest below about an incident, produce a structured brief in ${langName}. Use ONLY facts present in the digest — add nothing new.

- summary: a 2–4 sentence factual summary of what we found.
- timeline: dated events in order as {date, event}; empty array if the digest has no dates.
- angles: 3–5 distinct article angle / headline ideas a writer could pick.
- unverified: one short paragraph flagging claims that are thin, disputed, or where sources disagree; empty string if none.

RESEARCH DIGEST:
${digest || "(no credible coverage found)"}`,
      });
      summary = nz((object.summary || digest).trim(), lang);
      timeline = (object.timeline || [])
        .map((t) => ({ date: nz(String(t.date || "").trim(), lang), event: nz(String(t.event || "").trim(), lang) }))
        .filter((t) => t.event)
        .slice(0, 12);
      angles = (object.angles || []).map((a) => nz(String(a || "").trim(), lang)).filter(Boolean).slice(0, 6);
      unverified = nz((object.unverified || "").trim(), lang);
    } catch {
      /* keep the raw digest as the summary */
    }
  }

  return { summary, timeline, angles, unverified, sources, found };
}

/** Step 2 — write a grounded article from the incident + research. */
export async function writeArticle(opts: {
  incident: string;
  lang: Lang;
  angle?: string;
  targetWords: number;
  research: ResearchResult;
}): Promise<ArticleResult> {
  const { incident, lang, angle, targetWords, research } = opts;
  const isHi = lang === "hi";
  const langName = isHi ? "Hindi" : "English";

  const timelineBlock = research.timeline.length
    ? `\n\nTIMELINE:\n${research.timeline.map((t) => `- ${t.date ? `${t.date}: ` : ""}${t.event}`).join("\n")}`
    : "";
  const sourcesBlock = research.sources.length
    ? `\n\nSOURCES FOUND (titles, for grounding — do NOT print URLs):\n${research.sources.map((s, i) => `${i + 1}. ${s.title}${s.publisher ? ` — ${s.publisher}` : ""}`).join("\n")}`
    : "";
  const angleLine = angle ? `\n\nANGLE TO LEAD WITH: ${angle}` : "";
  const maxOutputTokens = Math.min(16000, Math.ceil(targetWords * (isHi ? 14 : 4)) + 1000);

  const rules = (web: boolean) => `RULES:
- Write in ${langName}, in simple everyday language for the common reader.
- Ground every specific (names, quotes, numbers, dates, places, the current status) in the RESEARCH / reporter's account${web ? " or your own web verification" : ""}. NEVER invent a person, quote, statistic or proper noun; if a specific isn't supported, keep it general rather than guess.
- Report the CURRENT status / outcome as of ${todayIN()}; don't freeze the story at its announcement.
- Clean prose: a short engaging intro (2–3 sentences), then the body; a few plain-text subheadings if genuinely helpful (no #, no **). Do NOT print source URLs and do NOT name other news outlets.
- Aim for roughly ${targetWords} words, but density over length — never pad or repeat.
- Produce the full finished article; never refuse and never show your working.`;

  const basePrompt = (web: boolean) => `You are a senior Patrika journalist. Write a publish-ready news article based on the reporter's incident account and the research below${web ? ", verifying specifics with web search where useful" : ""}.${angleLine}

INCIDENT (reporter's account):
${incident}

RESEARCH SUMMARY:
${research.summary || "(the reporter's account is the only source)"}${timelineBlock}${sourcesBlock}

${rules(web)}`;

  const openaiKey = await getApiKey("openai");
  let body = "";
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    const res = await generateText({
      model: openai.responses(SEARCH_MODEL),
      temperature: 0.3,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(130_000),
      tools: {
        web_search: openai.tools.webSearch({ searchContextSize: "high", userLocation: { type: "approximate", country: "IN" } }),
      },
      prompt: basePrompt(true),
    });
    body = stripCitations((res.text ?? "").trim());
  } else {
    // No web search available — ground strictly on the provided research.
    const model = await getModelFor("drafting");
    if (!model) throw new Error("No drafting model configured.");
    const res = await generateText({
      model: model.model,
      system: model.systemPrompt ?? undefined,
      temperature: 0.4,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(90_000),
      prompt: basePrompt(false),
    });
    body = stripCitations((res.text ?? "").trim());
  }
  body = isHi ? normalizeHindiTypography(body) : body;
  if (!body) throw new Error("Could not generate the article — try again.");

  // Headline from the finished body.
  let headline = "";
  const hmodel = await getModelFor("headline");
  if (hmodel) {
    try {
      const { object } = await generateObject({
        model: hmodel.model,
        temperature: 0.4,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(30_000),
        schema: z.object({ headline: z.string() }),
        prompt: `Write ONE strong, accurate ${langName} news headline (no surrounding quotes, no label) for this article:\n\n${body.slice(0, 2000)}`,
      });
      headline = (object.headline || "").trim();
    } catch {
      /* headline optional */
    }
  }
  headline = isHi ? normalizeHindiTypography(headline) : headline;

  return { headline, body };
}
