import { generateObject, generateText } from "ai";

import { getEffectiveDirectives, type DirectiveMap } from "@/lib/ai/directives";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { TRENDS } from "@/lib/data/trends";
import { getModelFor } from "@/lib/ai/provider";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Load the Patrika guidelines + 2 best-matched samples for this story type.
 * Both come from the Style Module (/style page).
 *
 * Sample selection: if the trend has a storyType (e.g. "Analysis"), pick
 * up to 2 samples tagged with the same story_type. Otherwise pick the
 * 2 most-recent samples regardless of tag. Cap each sample at ~3000 chars
 * to keep the prompt under model context limits.
 */
async function loadStyleAssets(
  storyType: string | null | undefined,
  publication?: string | null
): Promise<{
  guidelines: string | null;
  samples: Array<{ title: string; body: string; story_type: string | null }>;
  publication: string;
}> {
  const pub = (publication || "Patrika").trim();
  const isPatrika = /patrika/i.test(pub);
  if (!process.env.DATABASE_URL) {
    return { guidelines: null, samples: [], publication: pub };
  }
  const supabase = createAdminClient();

  // Guidelines: only Patrika keeps long-form DB guidelines (singleton). Other
  // outlets carry their house style via the directive block + samples below.
  let guidelines: string | null = null;
  if (isPatrika) {
    const { data: g } = await supabase
      .from("style_guidelines")
      .select("content")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    guidelines = (g as { content: string } | null)?.content?.trim() || null;
  }

  // Samples for THIS publication: prefer same story_type, fall back to newest.
  // The publication filter degrades gracefully if the column isn't migrated yet
  // (the query errors → return no samples rather than crashing generation).
  type SampleRow = { title: string; body: string; story_type: string | null };
  async function fetchSamples(byType: boolean): Promise<SampleRow[]> {
    let q = supabase
      .from("style_samples")
      .select("title, body, story_type")
      .eq("publication", pub);
    if (byType && storyType) q = q.eq("story_type", storyType);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(byType ? 2 : 5);
    if (error) return [];
    return (data as SampleRow[] | null) ?? [];
  }

  let samples: SampleRow[] = storyType ? await fetchSamples(true) : [];
  if (samples.length < 2) {
    const extra = await fetchSamples(false);
    const haveTitles = new Set(samples.map((s) => s.title));
    for (const s of extra) {
      if (samples.length >= 2) break;
      if (!haveTitles.has(s.title)) samples.push(s);
    }
    samples = samples.slice(0, 2);
  }

  // Truncate each sample body to keep prompt size sane
  samples = samples.map((s) => ({
    ...s,
    body: s.body.length > 3000 ? s.body.slice(0, 3000) + "…[truncated]" : s.body,
  }));

  return { guidelines, samples, publication: pub };
}

/**
 * The grounding-rules block that goes into EVERY draft prompt to suppress
 * the 2024-knowledge / hallucination problem. Anchors the AI to:
 *   1. Today's actual date (so it doesn't pretend it's still 2024)
 *   2. The signals provided (no inventions from training data)
 *   3. An explicit escape hatch when info is missing
 */
function groundingRules(lang: "en" | "hi"): string {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  if (lang === "hi") {
    return `
═══════════════════════════════════════════
सख्त नियम — कोई मनगढ़ंत तथ्य नहीं — ये कभी न तोड़ें
═══════════════════════════════════════════
• कोई मनगढ़ंत/काल्पनिक तथ्य नहीं। कुछ भी अपने आप न गढ़ें — हर तथ्य, नाम, संख्या, तारीख और उद्धरण नीचे दी गई "स्रोत रिपोर्ट" से ही आना चाहिए।
• आज की तारीख: ${today} (भारतीय समय)
• केवल नीचे दी गई "स्रोत रिपोर्ट" में मौजूद तथ्यों का उपयोग करें।
• अपनी प्रशिक्षण डेटा (2024 या उससे पहले) से कोई नाम, तारीख, उद्धरण, या संख्या न जोड़ें।
• यदि कोई जानकारी संकेतों में नहीं है तो [विवरण आवश्यक] लिखें — आविष्कार न करें।
• यदि संकेत अपर्याप्त हैं, तो जवाब दें: "INSUFFICIENT INFORMATION: <क्या चाहिए>"
• तथ्यों का श्रेय कहानी के लोगों/संस्थानों को दें ("पुलिस ने कहा", "एयरलाइन ने बताया") — कभी भी उन समाचार आउटलेट्स/एजेंसियों को नहीं जिन्होंने इसे रिपोर्ट किया। "दैनिक भास्कर के अनुसार", "ABP ने बताया" जैसा कुछ न लिखें और न ही किसी प्रकाशन का नाम लें। पत्रिका अपनी रिपोर्ट लिख रही है।
═══════════════════════════════════════════`;
  }
  return `
═══════════════════════════════════════════
HARD RULES — NO HALLUCINATION — never break these
═══════════════════════════════════════════
• NO HALLUCINATION. Invent NOTHING. Every fact, name, number, date, quote and
  organisation in your output MUST come from the SOURCE REPORTS below.
• Today's date: ${today} (IST). Your training data cutoff is irrelevant.
• Use ONLY facts present in the SOURCE REPORTS below.
• Do NOT add names, dates, quotes, numbers, organisations, or context from
  your training data — even if you "remember" them. They will be wrong or stale.
• If a fact isn't in the signals, write "[detail needed]" instead of inventing.
• If signals are insufficient, return literally: "INSUFFICIENT INFORMATION: <what's needed>"
• Attribute facts to the people / institutions IN the story ("the police said",
  "the airline said", "officials told reporters") — NEVER to the news outlets or
  wire agencies that carried the report. Do NOT write "according to Dainik Bhaskar",
  "ABP reported", "as per Times of India", or name any publication. Patrika is
  writing its OWN report from these facts.
═══════════════════════════════════════════`;
}

/**
 * Build the guidelines + samples preamble. Empty string if no style assets
 * configured yet, so behaviour degrades gracefully.
 */
function styleAssetsBlock(
  assets: Awaited<ReturnType<typeof loadStyleAssets>>
): string {
  const parts: string[] = [];
  if (assets.guidelines) {
    parts.push(
      `═══════════════════════════════════════════
PATRIKA EDITORIAL GUIDELINES — follow this voice + structure
═══════════════════════════════════════════
${assets.guidelines}
═══════════════════════════════════════════`
    );
  }
  if (assets.samples.length > 0) {
    const samplesText = assets.samples
      .map(
        (s, i) =>
          `### Sample ${i + 1}${s.story_type ? ` (${s.story_type})` : ""}
TITLE: ${s.title}

${s.body}`
      )
      .join("\n\n");
    parts.push(
      `═══════════════════════════════════════════
SAMPLE ${assets.publication.toUpperCase()} ARTICLES — mimic this structure, density, and voice
═══════════════════════════════════════════
${samplesText}
═══════════════════════════════════════════`
    );
  }
  return parts.join("\n\n");
}

const Body = z.object({
  trendId: z.union([z.number(), z.string()]).nullable(),
  mode: z.enum(["factual", "angle"]).default("factual"),
  lang: z.enum(["en", "hi"]).default("en"),
  // A specific AI-generated angle the editor selected. When present (mode
  // "angle"), the draft is written to THIS angle instead of the no-AI angle.
  angle: z
    .object({ title: z.string(), summary: z.string(), format: z.string() })
    .nullish(),
  // The AI Enhancement controls from the story-generation page.
  params: z
    .object({
      tone: z.string().optional(),
      readability: z.string().optional(),
      voice: z.string().optional(),
      headlineType: z.string().optional(),
      leadStyle: z.string().optional(),
      audienceFit: z.string().optional(),
      urgency: z.string().optional(),
      trendingScore: z.string().optional(),
      publication: z.string().optional(),
      writer: z.string().optional(),
      numberOfTitles: z.number().int().min(1).max(8).optional(),
      wordCount: z.number().int().min(100).max(2000).optional(),
    })
    .optional(),
});

type SelectedAngle = { title: string; summary: string; format: string };
type GenParams = NonNullable<z.infer<typeof Body>["params"]>;

/** Turn the AI Enhancement controls into a STRONG editorial-framing block.
 * These DEFINE the tone/voice — the identical facts must read very differently
 * as the settings change. */
function paramDirectives(p: GenParams | undefined, D: DirectiveMap): string {
  if (!p) return "";
  // Expand a control value into its directive text — the editor's override
  // (already merged into D) if any, otherwise the built-in default (also in D),
  // falling back to the bare value. Wording lives in lib/ai/directives.ts.
  const g = (control: string, val?: string | null): string | undefined =>
    val ? D[control]?.[val] ?? val : undefined;
  const lines: string[] = [];
  const tone = g("tone", p.tone);
  if (tone) lines.push(`- BASE TONE: ${tone} Let this dominate the writing.`);
  const urgency = g("urgency", p.urgency);
  if (urgency) lines.push(`- URGENCY: ${urgency}`);
  const audience = g("audience", p.audienceFit);
  if (audience) lines.push(`- AUDIENCE: ${audience}`);
  const trending = g("trending", p.trendingScore);
  if (trending) lines.push(`- BUZZ LEVEL: ${trending}`);
  const voice = g("voice", p.voice);
  if (voice) lines.push(`- VOICE: ${voice}`);
  const readability = g("readability", p.readability);
  if (readability) lines.push(`- READABILITY: ${readability}`);
  const leadStyle = g("leadStyle", p.leadStyle);
  if (leadStyle) lines.push(`- LEAD/OPENING: ${leadStyle}`);
  const publication = g("publication", p.publication);
  if (publication) lines.push(`- PUBLICATION STYLE: ${publication}`);
  const writer = g("writer", p.writer);
  if (writer) lines.push(`- WRITE AS: ${writer}.`);
  if (lines.length === 0) return "";
  return `═══════════════════════════════════════════
EDITORIAL FRAMING — these DEFINE the tone & voice. Adopt them STRICTLY: the
identical facts must read very differently as these settings change. Do NOT
fall back to a generic newsroom tone — commit fully to the framing below.
═══════════════════════════════════════════
${lines.join("\n")}`;
}

type LiveTrend = {
  id: string;
  title: string;
  title_hi: string | null;
  desk: string | null;
  section: string | null;
  suggested_angle: string | null;
  story_type: string | null;
  signals?: Array<{ author: string | null; content: string }>;
};

/**
 * Look up a trend either from the mock list (number id) or from Supabase
 * (uuid id). Returns the shape the prompt-builder needs.
 */
async function resolveTrend(
  trendId: number | string | null
): Promise<{
  title: string;
  title_hi?: string;
  desk?: string | null;
  section?: string | null;
  suggestedAngle?: string | null;
  storyType?: string | null;
  signals: Array<{ author: string; text: string }>;
} | null> {
  if (trendId == null) return null;

  // Mock data path: numeric ID
  if (typeof trendId === "number" || /^\d+$/.test(String(trendId))) {
    const mock = TRENDS.find((t) => t.id === Number(trendId));
    if (mock) {
      return {
        title: mock.title,
        title_hi: mock.title_hi,
        desk: mock.desk,
        section: mock.section,
        suggestedAngle: mock.suggestedAngle,
        storyType: mock.storyType,
        signals:
          mock.topSignals?.map((s) => ({ author: s.author, text: s.text })) ?? [],
      };
    }
  }

  // Live DB path: uuid id
  if (!process.env.DATABASE_URL) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trends")
    .select(
      `id, title, title_hi, desk, section, suggested_angle, story_type,
       signals ( author, content )`
    )
    .eq("id", String(trendId))
    .maybeSingle();

  if (!data) return null;
  const row = data as LiveTrend;
  return {
    title: row.title,
    title_hi: row.title_hi ?? undefined,
    desk: row.desk,
    section: row.section,
    suggestedAngle: row.suggested_angle,
    storyType: row.story_type,
    signals: (row.signals ?? []).slice(0, 6).map((s) => ({
      author: s.author ?? "Source",
      text: (s.content ?? "").split(" — ")[0].slice(0, 200),
    })),
  };
}

function buildPrompts(
  trend: NonNullable<Awaited<ReturnType<typeof resolveTrend>>>,
  mode: "factual" | "angle",
  lang: "en" | "hi",
  styleBlock: string,
  grounding: string,
  directives: DirectiveMap,
  selectedAngle?: SelectedAngle | null,
  params?: GenParams
) {
  // The angle the draft follows: the editor's chosen AI angle if present,
  // otherwise the no-AI suggested angle on the trend.
  const angleText = selectedAngle
    ? `${selectedAngle.title} — ${selectedAngle.summary}`
    : trend.suggestedAngle ?? "(none specified)";
  const angleFormat = selectedAngle?.format ?? trend.storyType ?? "Analysis";

  // AI Enhancement controls.
  const nTitles = params?.numberOfTitles ?? 4;
  const wordCount = params?.wordCount ?? (mode === "factual" ? 500 : 600);
  const headlineHint = params?.headlineType
    ? ` ${directives.headlineType?.[params.headlineType] ?? `Make the headlines ${params.headlineType} in style.`}`
    : "";
  const framing = paramDirectives(params, directives);
  const langDirective =
    lang === "hi"
      ? "Write in HINDI (Devanagari script). Match Patrika's Hindi newsroom voice."
      : "Write in ENGLISH. Match Patrika's English newsroom voice.";

  const baseContext = `
TOPIC: ${trend.title}
SECTION: ${trend.desk ?? trend.section ?? "General"}
SOURCE REPORTS — the ONLY facts you may use. These are how different outlets /
wire agencies reported the story. Use the FACTS; do NOT cite, name, or quote the
outlets themselves (the reader must never see "Dainik Bhaskar", "ABP", etc.):
${trend.signals.map((s, i) => `[${i + 1}] ${s.text}`).join("\n") || "(no reports captured)"}
`;

  // Style assets + grounding rules go at the TOP of every prompt so the
  // model sees them before any task-specific instructions.
  const preamble = [styleBlock, grounding, framing].filter(Boolean).join("\n\n");

  if (mode === "factual") {
    return {
      headlinePrompt: `${preamble}

${langDirective}

Write ${nTitles} DISTINCT newspaper headline options (each 8-14 words) that report what happened.${headlineHint} Active voice, no clickbait, no opinion. Vary the emphasis and structure across the options so the editor has real choice. Return them in the "titles" array.

${baseContext}`,

      bodyPrompt: `${preamble}

${langDirective}

Write a full ${wordCount}-word straight news report covering this story as breaking news — write the complete piece and do not stop short of ${wordCount} words. Style: factual newspaper-of-record. Match the voice and structure of the Patrika sample articles above.

${baseContext}

Rules:
- Start with a DATELINE in caps (e.g. MUMBAI:, NEW DELHI:)
- Lede paragraph: who/what/when/where in one tight sentence
- Attribute claims to the people / institutions in the story (police, officials, the company) — NEVER to the news outlets or agencies that reported it
- Do NOT invent quotes or facts beyond the signals above
- Do NOT use the suggested editorial angle — this draft is the straight report
- Unless it is under ~300 words, break the report into sections with 2–4 short, descriptive subheadings — each on its own line, prefixed with "## " — so it is scannable
- End with: [Factual draft · edit and verify before publishing.]`,
    };
  }

  // mode === "angle"
  return {
    headlinePrompt: `${preamble}

${langDirective}

Write ${nTitles} DISTINCT headline options (each 8-14 words) that capture the editorial ANGLE below, not just the surface event — headlines that pull a reader in via the perspective.${headlineHint} Vary the hook across options. Return them in the "titles" array.

TOPIC: ${trend.title}
EDITORIAL ANGLE: ${angleText}
STORY FORMAT: ${angleFormat}`,

    bodyPrompt: `${preamble}

${langDirective}

Write a full ${wordCount}-word piece in the format of ${angleFormat} — write the complete piece and do not stop short of ${wordCount} words. Match the structure, density, and voice of the Patrika sample articles above.

This is NOT a straight news report — it's the Patrika take following the editorial angle below.

${baseContext}

EDITORIAL ANGLE: ${angleText}
STORY FORMAT: ${angleFormat}

Rules:
- Open with a strong nut graf that signals the angle, not just the surface event
- Build the argument with evidence from the signals; bring in context that follows from the signals (not from training-data memory)
- Avoid generic news framing — the reader should know within 2 paragraphs why Patrika is covering this from THIS angle
- Attribute factual claims to the people / institutions in the story, never to the outlets that carried them; opinion can come from the analysis itself but mark it as such
- Don't invent quotes
- Unless it is under ~300 words, break the piece into sections with 2–4 short, descriptive subheadings — each on its own line, prefixed with "## " — so it is scannable
- End with: [Angle-driven draft (${angleFormat}) · edit and verify before publishing.]`,
  };
}

const HUMANIZE_SYSTEM =
  "You are a veteran Indian newspaper sub-editor who rewrites copy so it reads unmistakably like a human staff journalist — uneven, textured, alive — never like polished AI output. You never change a single fact.";

/** Instruction for the humanizer pass — rewrite for a genuinely human, hard-to-
 * detect voice while preserving every fact, dateline, subheading, marker + language. */
function humanizeInstruction(lang: "en" | "hi"): string {
  const langLine =
    lang === "hi"
      ? "The article is in HINDI — keep it entirely in Hindi (Devanagari), and write the way a Rajasthan-desk reporter actually speaks (bolchaal), not stiff textbook शुद्ध Hindi."
      : "The article is in ENGLISH — keep it entirely in English.";
  const hindiTells =
    lang === "hi"
      ? "\n- हिंदी के AI-टेल भी हटाओ: 'गौरतलब है कि' की भरमार, 'निष्कर्षतः', 'यह ध्यान देने योग्य है कि', 'एक ओर… वहीं दूसरी ओर' जैसा संतुलित ढाँचा, और ज़रूरत से ज़्यादा किताबी/औपचारिक हिंदी।"
      : "";
  return `Rewrite the news article below so a careful reader — AND an AI-detection tool — would take it as human-written, not AI-generated. ${langLine}

Make it HUMAN and UNEVEN (this is what defeats detectors — high burstiness, high perplexity):
- Vary sentence length HARD. Follow a long, winding sentence with a blunt three-word one. Never let two sentences in a row share the same rhythm.
- Vary paragraph length too — some a single line, some four or five.
- Use everyday, spoken words, contractions, the odd sentence fragment, a rhetorical question, a direct aside to the reader.
- Choose the specific, slightly unexpected word over the smooth predictable one. Name the concrete thing.
- Active voice, strong plain verbs.

KILL every AI tell:
- No "moreover / furthermore / in conclusion / it is important to note / delve / tapestry / navigate the landscape / plays a crucial role / in today's fast-paced world / a testament to".
- No tidy rule-of-three lists, no balanced this-vs-that constructions, no closing sentence that just restates the opening.
- Don't be perfectly organised or perfectly smooth — a little human unevenness is the whole point.${hindiTells}

KEEP EXACT — do not touch:
- Every fact, name, number, date and quote.
- The opening DATELINE and the final bracketed [ … ] marker line.
- Every "## " subheading — same words, same place.
- Roughly the same length and the same language.

Return ONLY the rewritten article — no preamble, no notes.`;
}

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const trend = await resolveTrend(parsed.data.trendId);
  const drafting = await getModelFor("drafting");
  if (!drafting) {
    return Response.json(
      {
        error:
          "No drafting model configured. Configure an AI provider in Admin → API Keys.",
      },
      { status: 503 }
    );
  }

  // A distinctive outlet house style (NYT, Reuters, Bloomberg…) needs a stronger
  // model than the per-tick default to actually ADOPT the voice — gpt-4o-mini
  // stays generic no matter the directives. Use gpt-4.1 for non-Patrika
  // publications when an OpenAI key is present (Patrika keeps the cheap default).
  const selectedPub = parsed.data.params?.publication;
  const isDistinctivePub = !!selectedPub && !/patrika/i.test(selectedPub);
  if (isDistinctivePub && process.env.OPENAI_API_KEY) {
    const styleModel = process.env.STYLE_DRAFT_MODEL ?? "gpt-4.1";
    drafting.model = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(styleModel);
    drafting.modelKey = styleModel;
    drafting.providerKey = "openai";
  }

  // No-trend path: just stub
  if (!trend) {
    const fb = await generateText({
      model: drafting.model,
      prompt:
        parsed.data.lang === "hi"
          ? "एक 400 शब्दों का समाचार लेख लिखें। शुरुआत में डेटलाइन (जैसे MUMBAI:) रखें।"
          : "Write a 400 word newspaper article on a topic of your choice. Start with a dateline in CAPS.",
    });
    return Response.json({
      title: "",
      body: fb.text.trim(),
      mode: parsed.data.mode,
    });
  }

  // Load the selected publication's style assets (guidelines + matched samples)
  // and build the grounding-rules preamble anchoring the model to date + signals.
  const styleAssets = await loadStyleAssets(
    trend.storyType,
    parsed.data.params?.publication
  );
  const styleBlock = styleAssetsBlock(styleAssets);
  const grounding = groundingRules(parsed.data.lang);

  const nTitles = parsed.data.params?.numberOfTitles ?? 4;
  const directives = await getEffectiveDirectives();
  const { headlinePrompt, bodyPrompt } = buildPrompts(
    trend,
    parsed.data.mode,
    parsed.data.lang,
    styleBlock,
    grounding,
    directives,
    parsed.data.angle,
    parsed.data.params
  );

  // Low temperature suppresses creative invention — the most reliable
  // single setting against the 2024-knowledge / hallucination problem. Lift it
  // a little for distinctive outlet styles so the voice can actually come
  // through; the hard grounding rules still forbid inventing facts.
  const TEMPERATURE = isDistinctivePub ? 0.4 : 0.2;

  // Token budget for the body. Without an explicit cap the AI SDK applies a
  // small default (~1k tokens ≈ 250-300 words), so long drafts were silently
  // truncated no matter what word count the editor asked for. maxOutputTokens is
  // only a CEILING — the model writes to the requested length and stops — so we
  // provision generously. Hindi (Devanagari) tokenizes to many more tokens per
  // word than English, so the budget must scale with language or Hindi drafts clip.
  const targetWords =
    parsed.data.params?.wordCount ?? (parsed.data.mode === "factual" ? 500 : 600);
  const bodyMaxTokens = Math.min(
    12000,
    Math.ceil(targetWords * (parsed.data.lang === "hi" ? 6 : 2)) + 400
  );

  let headlineRes, body;
  try {
    // Several headline OPTIONS (structured) so the editor can pick one — a
    // little more temperature here for genuine variety across the options.
    headlineRes = await generateObject({
      model: drafting.model,
      system: drafting.systemPrompt ?? undefined,
      schema: z.object({ titles: z.array(z.string()).min(2).max(8) }),
      prompt: headlinePrompt,
      temperature: 0.6,
    });

    body = await generateText({
      model: drafting.model,
      system: drafting.systemPrompt ?? undefined,
      prompt: bodyPrompt,
      temperature: TEMPERATURE,
      maxOutputTokens: bodyMaxTokens,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|RESOURCE_EXHAUSTED|429/i.test(msg);
    return Response.json(
      {
        error: rateLimited
          ? "AI rate limit hit — wait a few seconds and hit Regenerate."
          : `Generation failed: ${msg.slice(0, 200)}`,
      },
      { status: 503 }
    );
  }

  const titles = headlineRes.object.titles
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, nTitles);

  // Auto-humanize: a second pass rewrites the draft to read like a human wrote
  // it (facts, dateline and the closing marker preserved by the prompt).
  // Best-effort — if it fails or comes back too short, keep the original draft.
  let bodyText = body.text.trim();
  let humanized = false;
  // The humanize pass matters most for detection, so use the strongest model
  // available (gpt-4.1) with high temperature + penalties for real burstiness
  // and perplexity — a same-model, low-temp rewrite barely shifts the AI
  // fingerprint. Falls back to the drafting model if there's no OpenAI key.
  const humanizeModel = process.env.OPENAI_API_KEY
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(
        process.env.HUMANIZE_MODEL ?? "gpt-4.1"
      )
    : drafting.model;
  try {
    const rewrite = await generateText({
      model: humanizeModel,
      system: HUMANIZE_SYSTEM,
      prompt: `${humanizeInstruction(parsed.data.lang)}\n\n---\n${bodyText}`,
      temperature: 0.9,
      topP: 0.92,
      frequencyPenalty: 0.4,
      presencePenalty: 0.3,
      maxOutputTokens: bodyMaxTokens,
    });
    const cleaned = rewrite.text.trim();
    if (cleaned.length >= Math.min(120, bodyText.length * 0.5)) {
      bodyText = cleaned;
      humanized = true;
    }
  } catch {
    // keep the original draft
  }

  return Response.json({
    title: titles[0] ?? "",
    titles,
    body: bodyText,
    mode: parsed.data.mode,
    meta: {
      provider: drafting.providerKey,
      model: drafting.modelKey,
      temperature: TEMPERATURE,
      humanized,
      inputTokens:
        (headlineRes.usage?.inputTokens ?? 0) + (body.usage?.inputTokens ?? 0),
      outputTokens:
        (headlineRes.usage?.outputTokens ?? 0) + (body.usage?.outputTokens ?? 0),
      style: {
        guidelinesUsed: Boolean(styleAssets.guidelines),
        guidelinesChars: styleAssets.guidelines?.length ?? 0,
        samplesUsed: styleAssets.samples.length,
        sampleStoryTypes: styleAssets.samples.map((s) => s.story_type ?? "—"),
      },
    },
  });
}
