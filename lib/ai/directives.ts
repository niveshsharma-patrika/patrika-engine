import { createAdminClient } from "@/lib/supabase/server";
import { MAGAZINES, defaultIdeaPrompt, defaultContentPrompt } from "@/lib/magazines";

/**
 * Writing Directives — the prompt text each generation control expands into.
 *
 * The DEFAULT_DIRECTIVES below are the built-in wording. The `writing_directives`
 * table stores per-(control, optionValue) OVERRIDES that an editor sets from the
 * /directives page. `resolveDirectives()` merges overrides over the defaults, so:
 *   - editing is optional (nothing changes until a row is saved),
 *   - "reset to default" is just deleting the override row.
 *
 * The generator (app/api/drafts/generate/route.ts) calls getEffectiveDirectives()
 * and threads the merged map into the prompt builder.
 */

export type DirectiveMap = Record<string, Record<string, string>>;

/** Control key -> its GenParams field is mapped in route.ts. `options` is the
 * ordered list shown in the editor + the generation dropdowns (must match
 * app/page.tsx). */
export const DIRECTIVE_CONTROLS: Array<{ key: string; label: string; options: string[] }> = [
  { key: "urgency",      label: "Urgency",        options: ["Breaking", "Ongoing", "Evergreen"] },
  { key: "audience",     label: "Audience Fit",   options: ["Niche", "Broad", "General"] },
  { key: "trending",     label: "Trending Score", options: ["Low", "Medium", "High"] },
  { key: "tone",         label: "Tone",           options: ["Neutral", "Formal", "Conversational", "Authoritative", "Empathetic", "Punchy"] },
  { key: "readability",  label: "Readability",    options: ["Easy", "Moderate", "Expert"] },
  { key: "voice",        label: "Voice",          options: ["Brand-aligned", "Neutral", "First-person", "Investigative"] },
  { key: "headlineType", label: "Headline Type",  options: ["Factual", "Emotional", "Question", "How-to", "Number/List", "Punchy"] },
  { key: "leadStyle",    label: "Lead Style",     options: ["Summary", "Context", "Anecdote", "Question", "Quote"] },
  { key: "publication",  label: "Publication",    options: ["Patrika", "New York Times", "Reuters", "Al Jazeera", "BBC", "Bloomberg"] },
  { key: "writer",       label: "Writer",         options: [
    "Senior Reporter", "Beat Correspondent", "Data Journalist", "Columnist", "Features Writer",
    "Thomas Friedman", "Maureen Dowd", "Ross Douthat", "David Brooks", "NYT National Correspondent",
    "Reuters Markets Correspondent", "Reuters World Correspondent", "Reuters Breaking Desk",
    "Marwan Bishara", "Andrew Mitrovica", "AJ Field Correspondent",
    "Lyse Doucet", "Jeremy Bowen", "Faisal Islam", "BBC News Correspondent",
    "Matt Levine", "John Authers", "Tyler Cowen", "Bloomberg Markets Reporter",
  ] },
  { key: "magazineIdea",    label: "Magazine — Idea prompts",    options: MAGAZINES.map((m) => m.key) },
  { key: "magazineContent", label: "Magazine — Content prompts", options: MAGAZINES.map((m) => m.key) },
];

export const DEFAULT_DIRECTIVES: DirectiveMap = {
  urgency: {
    Breaking: "URGENT breaking-news tone — immediacy, present tense, short high-tempo sentences, the feel of events unfolding right now.",
    Ongoing: "a developing-story tone — current but measured; lead with 'here is the latest' and emphasise what has changed.",
    Evergreen: "a calm, timeless explainer tone — ZERO urgency, written to read well on any day.",
  },
  audience: {
    Niche: "a NICHE expert audience — assume domain knowledge, use precise terminology, skip the basics.",
    Broad: "a BROAD mass audience — explain every term and piece of context in plain language, assume no prior knowledge.",
    General: "a GENERAL news audience — clear and accessible, with light context where it helps.",
  },
  trending: {
    High: "a HIGH-buzz, widely-watched story — write with momentum and energy.",
    Medium: "a story of moderate interest — a steady, professional newsroom register.",
    Low: "a low-buzz story — understated and matter-of-fact.",
  },
  tone: {
    Neutral: "a neutral, even-handed register — report the facts plainly, with no slant or emotional colouring.",
    Formal: "a formal, measured register — full sentences, professional diction, no contractions or slang.",
    Conversational: "a conversational register — direct, warm and plain-spoken, as if explaining to a smart friend.",
    Authoritative: "an authoritative register — confident and declarative, the voice of a newsroom that knows the story cold.",
    Empathetic: "an empathetic register — lead with the human impact and treat those affected with care.",
    Punchy: "a punchy register — short, energetic sentences, strong verbs and momentum on every line.",
  },
  readability: {
    Easy: "write at an EASY reading level — short sentences, everyday words, no jargon; a general reader breezes through it.",
    Moderate: "write at a MODERATE reading level — a standard newspaper register, with some complexity where the story needs it.",
    Expert: "write at an EXPERT reading level — assume a well-informed reader; precise terminology and denser sentences are fine.",
  },
  voice: {
    "Brand-aligned": "Patrika's house brand voice.",
    Neutral: "a neutral, impersonal news voice.",
    "First-person": "a first-person reporter voice where it fits.",
    Investigative: "a probing, investigative voice.",
  },
  // headlineType directives are phrased as an instruction — they shape the
  // HEADLINE prompt, not the body framing block.
  headlineType: {
    Factual: "Make the headlines FACTUAL — state precisely what happened, with no spin.",
    Emotional: "Make the headlines EMOTIONAL — lead with the human stakes and stir genuine feeling (never cheap sensationalism).",
    Question: "Make the headlines QUESTIONS — pose the question the reader is already asking.",
    "How-to": "Make the headlines HOW-TO — frame them as practical, actionable guidance.",
    "Number/List": "Make the headlines NUMBER/LIST style — lead with a number or a countable hook.",
    Punchy: "Make the headlines PUNCHY — short, sharp and high-impact; every word earns its place.",
  },
  leadStyle: {
    Summary: "open with a SUMMARY lead — one tight sentence stating the core news (who/what/when/where).",
    Context: "open with a CONTEXT lead — set the scene or the stakes in a sentence, then land the news.",
    Anecdote: "open with an ANECDOTE lead — a specific person, moment or scene that embodies the story, then widen out.",
    Question: "open with a QUESTION lead — pose the question the story answers, then answer it.",
    Quote: "open with a QUOTE lead — a striking, verifiable quote from someone in the story (never invented).",
  },
  publication: {
    Patrika: "Patrika's standard newsroom house style.",
    "Patrika House": "Patrika's standard newsroom house style.",
    "New York Times":
      "the New York Times house style — authoritative, deeply reported and literary. Open with a vivid scene or a sharp lead, then a clear nut graf on why it matters. Long, well-built sentences; precise, sophisticated vocabulary; scrupulous sourcing; a measured, intelligent 'paper of record' tone.",
    Reuters:
      "Reuters wire style — a strict inverted pyramid. Put who/what/when/where/why in the first one or two sentences. Spare, neutral, impartial prose; no adjectives of opinion; attribute every claim; short paragraphs; fast and factual; ~300-600 words. Never editorialise.",
    "Al Jazeera":
      "Al Jazeera English style — clear, accessible global journalism told from the Global South's vantage point. Lead with the human stakes, give rich historical and geopolitical context, foreground the voices of those affected, and explain the politics plainly. Empathetic but rigorous; avoid Western-centric framing.",
    BBC:
      "BBC News style — calm, impartial, plain authoritative English. Lead with the verified development; attribute carefully ('officials say', 'the BBC understands'); explain clearly for a broad global audience; fairly balance viewpoints; never sensationalise. Measured and trustworthy.",
    Bloomberg:
      "Bloomberg style — sharp business-and-markets journalism. Lead with the development and immediately answer 'what it means for markets and investors'; foreground numbers, money and market impact; tight, brisk sentences; data-rich; a dry, knowing, professional tone.",
  },
  writer: {
    // Patrika (generic role presets)
    "Senior Reporter": "an authoritative senior reporter",
    "Beat Correspondent": "a beat correspondent close to the sources",
    "Data Journalist": "a data journalist foregrounding numbers and context",
    Columnist: "an opinionated columnist (mark opinion clearly as such)",
    "Features Writer": "a features writer with narrative flair",
    // New York Times
    "Thomas Friedman": "in the vein of Thomas Friedman — big-picture foreign-affairs framing, vivid metaphors, a guiding thesis",
    "Maureen Dowd": "in the vein of Maureen Dowd — sharp, witty, culturally-attuned, pointed prose",
    "Ross Douthat": "in the vein of Ross Douthat — measured, philosophical, conservative-leaning analysis",
    "David Brooks": "in the vein of David Brooks — sociological, values-and-character, synthesising big ideas",
    "NYT National Correspondent": "an NYT national correspondent — scene-setting, deeply reported long-form",
    // Reuters
    "Reuters Markets Correspondent": "a Reuters markets correspondent — numbers-first, terse, market-moving facts",
    "Reuters World Correspondent": "a Reuters world-desk correspondent — dateline-led, balanced, impartial",
    "Reuters Breaking Desk": "a Reuters breaking-news reporter — lead with the development, minimal adjectives",
    // Al Jazeera
    "Marwan Bishara": "in the vein of Marwan Bishara — senior political analysis of geopolitics and the Middle East",
    "Andrew Mitrovica": "in the vein of Andrew Mitrovica — pointed, critical columnist voice",
    "AJ Field Correspondent": "an Al Jazeera field correspondent — human-centred, on-the-ground, Global-South context",
    // BBC
    "Lyse Doucet": "in the vein of Lyse Doucet — humane international correspondent reporting from the ground",
    "Jeremy Bowen": "in the vein of Jeremy Bowen — analytical on-the-ground Middle East reportage",
    "Faisal Islam": "in the vein of Faisal Islam — clear, accessible economics explanation",
    "BBC News Correspondent": "a BBC news correspondent — neutral, balanced, carefully attributed",
    // Bloomberg
    "Matt Levine": "in the vein of Matt Levine — witty, discursive, finance-explained-cleverly (Money Stuff voice)",
    "John Authers": "in the vein of John Authers — macro and markets analysis with historical context",
    "Tyler Cowen": "in the vein of Tyler Cowen — contrarian, idea-dense economics commentary",
    "Bloomberg Markets Reporter": "a Bloomberg markets reporter — numbers-led, terse, market-impact framing",
  },
  magazineIdea: Object.fromEntries(MAGAZINES.map((m) => [m.key, defaultIdeaPrompt(m)])),
  magazineContent: Object.fromEntries(MAGAZINES.map((m) => [m.key, defaultContentPrompt(m)])),
};

type OverrideRow = { control: string; option_value: string; directive: string };

/** Read the editor's saved overrides from the DB. Returns {} on any failure so
 * generation never breaks — the built-in defaults still apply. */
export async function loadDirectiveOverrides(): Promise<DirectiveMap> {
  if (!process.env.DATABASE_URL) return {};
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("writing_directives")
      .select("control, option_value, directive");
    const map: DirectiveMap = {};
    for (const row of (data as OverrideRow[] | null) ?? []) {
      (map[row.control] ??= {})[row.option_value] = row.directive;
    }
    return map;
  } catch {
    return {};
  }
}

/** Merge overrides over the built-in defaults. */
export function resolveDirectives(overrides: DirectiveMap): DirectiveMap {
  const merged: DirectiveMap = {};
  for (const control of Object.keys(DEFAULT_DIRECTIVES)) {
    merged[control] = { ...DEFAULT_DIRECTIVES[control], ...(overrides[control] ?? {}) };
  }
  // Preserve any override control keys not present in defaults (future-proof).
  for (const control of Object.keys(overrides)) {
    if (!merged[control]) merged[control] = { ...overrides[control] };
  }
  return merged;
}

/** The effective directive map used by the generator: defaults + DB overrides. */
export async function getEffectiveDirectives(): Promise<DirectiveMap> {
  return resolveDirectives(await loadDirectiveOverrides());
}
