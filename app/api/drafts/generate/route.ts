import { generateObject, generateText } from "ai";

import { getEffectiveDirectives, type DirectiveMap } from "@/lib/ai/directives";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { TRENDS } from "@/lib/data/trends";
import { getModelFor, getApiKey } from "@/lib/ai/provider";
import { searchGoogleNews } from "@/lib/sources/google-news";
import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { MAGAZINE_BY_KEY } from "@/lib/magazines";

// Web-search-grounded drafting (write-on-a-topic) does live research — and now
// a conditional second "expand" pass — so give it generous room before the
// proxy/serverless cut-off (nginx proxy_read_timeout is 200s).
export const maxDuration = 200;
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
 * The grounding-rules block that goes into EVERY draft prompt to keep the AI
 * factual (no 2024-knowledge / hallucination) WITHOUT making it refuse. Anchors:
 *   1. Today's actual date (so it doesn't pretend it's still 2024)
 *   2. The signals provided (don't invent SPECIFIC facts from training data)
 *   3. "Always write the article" — general context is allowed; no bail-outs
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
आधार नियम — तथ्यपरक रहें, लेकिन लेख हमेशा लिखें
═══════════════════════════════════════════
• लेख केवल नीचे दी गई "स्रोत रिपोर्ट" पर आधारित हो। आज की तारीख: ${today} (भारतीय समय)।
• कोई विशिष्ट तथ्य न गढ़ें — ऐसे नाम, संख्या, तारीख, उद्धरण या संस्था न जोड़ें जो "स्रोत रिपोर्ट" में नहीं हैं। प्रशिक्षण डेटा से पुराने विवरण न लाएँ।
• रिपोर्ट किए गए तथ्यों से तर्कसंगत रूप से निकलने वाला सामान्य संदर्भ, पृष्ठभूमि और विश्लेषण लिख सकते हैं — इसी से लेख को पूरी लंबाई तक विकसित करें।
• यदि कोई विशिष्ट विवरण मौजूद नहीं है तो उसे सामान्य शब्दों में लिखें। "[विवरण आवश्यक]" जैसे प्लेसहोल्डर न डालें; मना न करें, माफ़ी न माँगें, कोई त्रुटि-संदेश न दें। हमेशा पूरा, प्रकाशन-योग्य लेख लिखें।
• तथ्यों का श्रेय कहानी के लोगों/संस्थानों को दें ("पुलिस ने कहा", "एयरलाइन ने बताया") — कभी भी उन समाचार आउटलेट्स को नहीं जिन्होंने रिपोर्ट किया। किसी प्रकाशन का नाम न लें। पत्रिका अपनी रिपोर्ट लिख रही है।
═══════════════════════════════════════════`;
  }
  return `
═══════════════════════════════════════════
GROUNDING — stay factual, but ALWAYS write the full article
═══════════════════════════════════════════
• Base the article on the SOURCE REPORTS below. Today's date: ${today} (IST);
  your training-data cutoff is irrelevant.
• Do NOT fabricate SPECIFIC facts — names, numbers, dates, quotes, or organisations
  that are not in the SOURCE REPORTS. Don't pull "remembered" specifics from your
  training data; they'll be stale.
• You MAY add general context, background, and analysis that reasonably follows
  from the reported facts — this is how you develop the piece to the full length.
• If a specific detail is missing, write around it in general terms. Do NOT insert
  placeholders like "[detail needed]", and do NOT refuse, apologise, or return any
  meta-message or error. ALWAYS produce the finished, publish-ready article.
• Attribute facts to the people / institutions IN the story ("the police said",
  "the airline said", "officials told reporters") — NEVER to the news outlets or
  wire agencies that carried the report. Do NOT name any publication. Patrika is
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
  // The editor's typed headline/topic — used as the subject on the no-trend
  // ("Write on a topic") path. Ignored when a trend is selected.
  title: z.string().max(300).optional(),
  mode: z.enum(["factual", "angle"]).default("factual"),
  lang: z.enum(["en", "hi"]).default("en"),
  // Patrika+ magazine key. When set (article generated from a Patrika+ idea),
  // that section's content prompt is layered onto the drafting as voice/format
  // guidance — on TOP of the web-search grounding.
  magazine: z.string().max(60).optional(),
  // Optional desk angle filter key (e.g. politics: current / this-day / profile).
  magazineFilter: z.string().max(60).optional(),
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
  signals?: Array<{ author: string | null; content: string; description: string | null }>;
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
       signals ( author, content, description )`
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
    // Feed the headline AND the enriched description the pipeline already stored,
    // for more sources — so the model has real material to write to length
    // instead of ~6 bare headlines. More/richer signals = fuller, still-grounded drafts.
    signals: (row.signals ?? []).slice(0, 12).map((s) => {
      const headline = (s.content ?? "").split(" — ")[0].trim();
      const text = [headline, s.description?.trim()].filter(Boolean).join(" — ").slice(0, 700);
      return { author: s.author ?? "Source", text };
    }),
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

/**
 * Strip the inline citations / source URLs that web-search models embed
 * (e.g. "([hindustantimes.com](https://…?utm_source=openai))" or 【…】). The
 * article body should be clean prose; sources are surfaced separately.
 */
function stripCitations(text: string): string {
  return text
    // Markdown links: KEEP the informative link text (facts/dates live there) —
    // drop only pure domain/citation labels and the URL itself.
    .replace(/\(?\s*\[([^\]]*)\]\(https?:\/\/[^)\s]+\)\s*\)?/g, (_m, label: string) => {
      const l = label.trim();
      return /^[\w-]+(\.[\w-]+)+$/.test(l) ? "" : l; // domain-only → drop; text → keep
    })
    .replace(/\(\s*https?:\/\/[^)\s]+\s*\)/g, "") // (url)
    .replace(/https?:\/\/[^\s)]+/g, "") // bare urls
    .replace(/【[^】]*】/g, "") // 【…】 citation markers
    .replace(/\[\s*\]|\(\s*\)/g, "") // leftover empty [] ()
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([।.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  // Count this generation for the productivity report — even if the writer
  // never saves the resulting draft. Fire-and-forget: never blocks or fails
  // the generation itself.
  try {
    const session = await getSession();
    if (session) {
      void pool
        .query(`INSERT INTO generation_events (user_id, kind) VALUES ($1, 'article')`, [
          session.userId,
        ])
        .catch(() => {});
    }
  } catch {
    /* ignore — logging must never break drafting */
  }

  // A distinctive outlet house style (NYT, Reuters, Bloomberg…) needs a stronger
  // model than the per-tick default to actually ADOPT the voice — gpt-4o-mini
  // stays generic no matter the directives. Use gpt-4.1 for non-Patrika
  // publications when an OpenAI key is present (Patrika keeps the cheap default).
  const selectedPub = parsed.data.params?.publication;
  const isDistinctivePub = !!selectedPub && !/patrika/i.test(selectedPub);
  const styleOpenaiKey = isDistinctivePub ? await getApiKey("openai") : null;
  if (isDistinctivePub && styleOpenaiKey) {
    const styleModel = process.env.STYLE_DRAFT_MODEL ?? "gpt-4.1";
    drafting.model = createOpenAI({ apiKey: styleOpenaiKey })(styleModel);
    drafting.modelKey = styleModel;
    drafting.providerKey = "openai";
  }

  // Write-on-a-topic (no trend): use OpenAI web search to research CURRENT,
  // verified facts and write from them (not the model's stale memory). Falls
  // back to a keyless Google News headline grounding if there's no OpenAI key.
  if (!trend) {
    const topic = (parsed.data.title ?? "").trim();
    if (!topic) {
      return Response.json(
        { error: "Type a headline / topic to write about." },
        { status: 400 }
      );
    }
    const p = parsed.data.params;
    const isHi = parsed.data.lang === "hi";
    const targetWords = p?.wordCount ?? 600;
    const directives = await getEffectiveDirectives();
    const framing = paramDirectives(p, directives);

    // Patrika+ special-content voice. When the article was generated from a
    // Patrika+ idea, layer that section's content prompt on top of the grounded
    // draft — it drives voice/structure/format, facts still come from research.
    const magKey = parsed.data.magazine?.trim();
    const magPrompt = magKey ? directives.magazineContent?.[magKey] : undefined;
    // Desk angle filter (e.g. politics: current topic / on this day / profile).
    const magFilter = magKey
      ? MAGAZINE_BY_KEY[magKey]?.filters?.find((f) => f.key === parsed.data.magazineFilter?.trim())
      : undefined;
    const filterLine = magFilter
      ? `\n\nएंगल/फ़िल्टर — यह पूरा लेख इसी एंगल से लिखो: "${magFilter.label}" — ${magFilter.brief}`
      : "";
    const magazineBlock = (magPrompt
      ? `\n\nPATRIKA+ SPECIAL CONTENT — write in the voice of the Patrika+ "${magKey}" desk. This is almost always a PRACTICAL EXPLAINER / feature / guide for the reader (wellness, lifestyle, finance, how-to) — NOT a breaking-news roundup; write it that way unless the topic is genuinely a news event. Use the brief below ONLY as guidance for voice, tone and WHAT to cover. However the brief is worded, your OUTPUT MUST be ONE continuous, fully-written article body in flowing prose:
- Do NOT print field labels ("हेडलाइन:", "हुक इंट्रो:", "समस्या:", "CTA:", "टैग:", "WhatsApp…", "इन्फोग्राफिक…", "Suggested Tags", etc.).
- Do NOT include a separate headline line, a WhatsApp teaser, infographic bullet points, or a tag list in the body — ONLY the article itself. (The headline is generated separately.)
- Open DIRECTLY with the article's first line. NEVER start with a preface like "यहाँ प्रस्तुत है…", "प्रस्तुत है…", "इस लेख में…" or any sentence describing that this is a feature.
- Write in FLOWING PARAGRAPHS as the default; use a list only for a genuine step-by-step or one short key-points summary — never render explanation, research or context as bullets.
- NEVER leave a placeholder such as "[सोर्स जोड़ें]" / "[स्रोत/लिंक जोड़ें]" — use a real, verified detail from your research or omit it. Never fabricate a source, quote, name or number.
- Weave any required elements (expert view, data, reader takeaway, any disclaimer) naturally into the prose and short plain-text subheadings — not as a checklist.
Where the brief's voice conflicts with the generic newspaper framing above, the brief wins; facts still come only from your research.

BRIEF:
${magPrompt}`
      : "") + filterLine;

    const langLine = isHi
      ? "पूरा लेख हिंदी (देवनागरी लिपि) में लिखें।"
      : "Write the entire article in English.";
    // Roomier budget — a rich, structured feature with explainer sections runs
    // longer than a flat report, so allow the model to expand for depth.
    const maxOutputTokens = Math.min(15000, Math.ceil(targetWords * (isHi ? 9 : 3)) + 800);

    // Headline options generated from the finished article (no search needed).
    // Catchy, click-worthy Hindi-web style — NOT dry academic headlines.
    const nTitles = p?.numberOfTitles ?? 4;
    const headlinePromptFor = (article: string): string =>
      isHi
        ? `तुम एक लोकप्रिय हिंदी न्यूज़ वेबसाइट (जैसे राजस्थान पत्रिका / अमर उजाला / दैनिक भास्कर) के हेडलाइन राइटर हो। नीचे दिए लेख के लिए ${nTitles} अलग-अलग, आकर्षक और क्लिक करने लायक हिंदी हेडलाइन लिखो — ऐसी जिन पर पाठक सच में क्लिक करें।

शैली:
• रोज़मर्रा की बोलचाल वाली सरल, चटपटी हिंदी। जहाँ लोग वैसे ही बोलते हैं, वहाँ आम अंग्रेज़ी शब्द देवनागरी में इस्तेमाल करो (जैसे प्रेग्नेंसी, टिप्स, फिट, हेल्थ, डाइट) — भारी/किताबी शब्दों (गर्भावस्था, परामर्श, "का सकारात्मक प्रभाव") की जगह।
• जिज्ञासा या सवाल वाला हुक, या पाठक को साफ़ फायदा/वादा — अक्सर दो हिस्सों में: हुक + पेऑफ़। उदाहरण शैली: "प्रेग्नेंसी और बच्चा जनने के बाद मानसिक स्वास्थ्य के लिए क्या करें? टिप्स फॉलो कर शीघ्र हो जाएंगे फिट"।
• सीधे पाठक से बात करो; उपयोगी और तुरंत काम आने वाला महसूस हो।
• सूखी, शोध-पत्र जैसी, कोलन-स्टाइल "अध्ययन में साबित / का सकारात्मक प्रभाव / नया अध्ययन" वाली हेडलाइन बिल्कुल मत लिखो।
• लेख के तथ्यों के प्रति सही रहो — आकर्षक हो, पर भ्रामक या झूठा नहीं।

${nTitles} विकल्प "titles" ऐरे में दो।

लेख:
${article.slice(0, 2500)}`
        : `You are a headline writer for a popular news website. Write ${nTitles} distinct, catchy, click-worthy English headlines for the article below — the kind readers actually tap. Use a question / curiosity hook OR a clear reader benefit, often in two parts (hook + payoff). Everyday punchy language; speak directly to the reader. Do NOT write dry, academic "study proves / a new study on… / positive effect of…" headlines. Stay accurate to the article — catchy, not misleading. Return them in the "titles" array.

ARTICLE:
${article.slice(0, 2500)}`;

    const headlinesFrom = async (article: string): Promise<string[]> => {
      try {
        const h = await generateObject({
          model: drafting.model,
          schema: z.object({ titles: z.array(z.string()).min(2).max(8) }),
          prompt: headlinePromptFor(article),
          temperature: 0.75,
        });
        return [topic, ...h.object.titles.filter((t) => t.trim() && t.trim() !== topic)];
      } catch {
        return [topic];
      }
    };

    const openaiKey = await getApiKey("openai");
    if (openaiKey) {
     try {
      // Primary: the model researches live sources with web search and grounds
      // the article in what it actually finds — not outdated training memory.
      const openai = createOpenAI({ apiKey: openaiKey });
      const bodyPrompt = `You are a senior Patrika feature journalist. Write an in-depth, publish-ready article on the topic below. FIRST research it thoroughly with web search, verify everything, then write — using ONLY what you actually find, never stale memory.

TOPIC: ${topic}

STEP 1 — PICK THE RIGHT FORM (this decides everything):
• Is this a NEWS development — something that just happened, was announced, or changed, where the reader wants to know WHAT HAPPENED? → write a NEWS ARTICLE: lead with the latest verified development, then context, stakeholders, what's next.
• OR is it an EXPLAINER / how-to / practical guide / evergreen wellness–finance–lifestyle topic (e.g. "yoga for seniors", "understand your electricity bill", "10-minute fitness routine") where the reader wants to UNDERSTAND something or DO something? → write a PRACTICAL EXPLAINER: open with a relatable hook, then explain what it is and why it matters to the reader, how to do/apply it (concrete steps/options), what to watch out for, and useful tips — grounded in evidence and expert guidance. Do NOT force a news framing: NO dateline, and do NOT turn it into a roundup of "recent government schemes/events" unless the topic is genuinely about those.
Match the treatment to the topic. Most Patrika+ lifestyle / health / finance topics are EXPLAINERS, not news — do not report them like news. Decide the form SILENTLY: NEVER tell the reader which form you chose, and never write a line like "यह कोई नया समाचार नहीं है, बल्कि एक व्यावहारिक गाइड है" or "this is a practical guide with scientific evidence". Just write the article itself.

STEP 2 — RESEARCH for that form:
• NEWS: latest status, exact figures/dates/names, official specifics, reactions, what's next.
• EXPLAINER: the substance a reader actually needs — how it works, the practical steps and options, expert-recommended best practices, real benefits with evidence, precautions and common mistakes, relatable examples.
• EVIDENCE MUST BE SPECIFIC AND NAMED — this is important: cite REAL studies, institutions, experts or official data with concrete detail. Name the study / institution / journal / expert and the year, and give the exact finding (sample size, percentage, figure). Do NOT write a vague "एक अध्ययन में पाया गया / a study found / एक और शोध बताता है" without naming it. Include at least 3–4 such concrete, attributed data points or expert views, woven into the prose.
• Either way: verify names, numbers and claims; if something can't be verified, leave it out. Never fabricate a source, quote, figure or name, and never leave a placeholder like "[सोर्स जोड़ें]".

STEP 3 — WRITE:
• ${langLine}
• SIMPLE, EVERYDAY LANGUAGE for the common reader (आम पाठक). Avoid hard, bookish or heavily Sanskritised words and unexplained English/scientific jargon — e.g. do NOT write "परिसंचरण" (say "खून का दौरा/रक्त का बहाव"). If a technical term is truly needed (VO2max, ग्लाइसेमिक, बायोमार्कर, इंसुलिन प्रतिरोध), explain it in plain words in brackets. Keep it conversational and easy to follow.
• INTERNAL CONSISTENCY: keep numbers, frequencies and dosages consistent and non-contradictory. If different studies used different protocols (e.g. 10 min 3×/week vs 10 min 2×/day), attribute each figure clearly to its own study, and give the reader ONE clear, coherent recommendation — never blend conflicting frequencies into confusing advice.
• LENGTH: about ${targetWords} words — treat this as a firm target, not a rough hint. If you are running short, ADD more genuine depth (more practical detail, more sections, examples) — never stop early, and never pad with filler.
• Open DIRECTLY with the article's first line. NEVER start with a preface like "यहाँ प्रस्तुत है…", "प्रस्तुत है…", "इस लेख में…", "Here is…" or any line that describes this as a feature/article.
• FLOWING PARAGRAPHS are the default — 2–4 sentence paragraphs under SHORT natural subheadings (a question or short phrase; plain text — no #, no **). Weave facts, evidence and expert views INTO the prose, attributed.
• Use a bulleted/numbered list ONLY for a genuine step-by-step how-to or ONE short "key points" summary (at most one or two lists in the whole piece); a table only for a real comparison. NEVER render explanation, research or context as bullets.
• End with a natural, forward-looking conclusion — and nothing after it (no note about word count, sources or "facts verified").
• Patrika voice. Do NOT name other news outlets. No source links or URLs in the text, but keep every specific fact, date, number and name you use.
• Never refuse; always produce the full finished article.
${framing}${magazineBlock}`;

      const bodyRes = await generateText({
        model: openai.responses(process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o"),
        prompt: bodyPrompt,
        temperature: 0.3,
        maxOutputTokens,
        tools: {
          web_search: openai.tools.webSearch({
            searchContextSize: "high",
            userLocation: { type: "approximate", country: "IN" },
          }),
        },
      });

      let finalBody = stripCitations(bodyRes.text);
      let sourceCount = bodyRes.sources?.length ?? 0;
      const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

      // Length top-up. Models chronically undershoot Hindi word targets, so if
      // the draft is materially short, do ONE more web-search pass that expands
      // it with REAL added substance — more named studies/data + practical
      // depth — not filler. Only runs when needed, to keep latency down.
      if (wc(finalBody) < targetWords * 0.8) {
        try {
          const expandRes = await generateText({
            model: openai.responses(process.env.TOPIC_SEARCH_MODEL ?? "gpt-4o"),
            prompt: `The Hindi article below is too SHORT — it is about ${wc(finalBody)} words but must be about ${targetWords} words. Expand it to roughly ${targetWords} words by ADDING real substance, NOT filler or repetition: research further with web search for MORE specific, NAMED studies / institutions / experts / official data (with exact figures, years, sample sizes) and add practical detail, steps, examples and useful sections. Keep everything already correct, and keep the same structure, voice and flowing-prose style. Use SIMPLE everyday language for the common reader (avoid hard/technical words; explain any needed term in plain words). Keep all numbers and frequencies CONSISTENT — do not introduce contradictory figures. Do NOT add any preface, any note about length/sources, or any line saying what kind of article this is. ${langLine}

Return ONLY the full expanded article.

ARTICLE:
${finalBody}`,
            temperature: 0.3,
            maxOutputTokens,
            tools: {
              web_search: openai.tools.webSearch({
                searchContextSize: "high",
                userLocation: { type: "approximate", country: "IN" },
              }),
            },
          });
          const expanded = stripCitations(expandRes.text);
          if (wc(expanded) > wc(finalBody)) {
            finalBody = expanded;
            sourceCount += expandRes.sources?.length ?? 0;
          }
        } catch (e) {
          console.error("Expand pass failed; using original draft:", e);
        }
      }

      return Response.json({
        titles: await headlinesFrom(finalBody),
        title: topic,
        body: finalBody,
        mode: parsed.data.mode,
        sources: sourceCount,
      });
     } catch (e) {
       console.error("Web-search draft failed; falling back to headline search:", e);
     }
    }

    // Fallback (no OpenAI key, or web search failed): ground on Google News headlines.
    const hits = await searchGoogleNews(topic, parsed.data.lang, 10);
    const sourcesBlock = hits.length
      ? `LATEST NEWS on this topic — ${hits.length} recent reports. Use these for the CURRENT facts and developments:\n${hits
          .map((h, i) => `[${i + 1}] ${h.title}`)
          .join("\n")}\n\n`
      : "";
    const sourcesRule = hits.length
      ? "• Lead with the newest development from the headlines above; use them for what is happening NOW. Do NOT fabricate specific facts, numbers, or reasons beyond them."
      : "• No live reports were found; write accurately from established knowledge and keep uncertain specifics general rather than fabricating them.";
    const fbPrompt = `You are a senior Patrika feature journalist. Write a complete, publish-ready, richly structured article on THIS EXACT topic:

TOPIC: ${topic}

${sourcesBlock}${langLine}
• FIRST pick the right form (SILENTLY — never state which form you chose, no "यह गाइड है/समाचार नहीं" line): if this is a NEWS development, write a news article (lead with the latest); if it's an EXPLAINER / how-to / evergreen wellness–finance–lifestyle topic, write a PRACTICAL EXPLAINER (what it is, why it matters, how to do it, precautions, tips) — NO dateline, NOT a roundup of recent schemes. Most Patrika+ topics are explainers, not news.
• SIMPLE, everyday language for the common reader — avoid hard/bookish/technical words (e.g. not "परिसंचरण" → "खून का दौरा"); explain any needed term in plain words. Keep numbers and frequencies consistent, not contradictory.
• LENGTH: about ${targetWords} words — a firm target; if short, add real depth rather than stopping early.
• Write a FLOWING FEATURE in paragraphs. Open DIRECTLY with the lede — NEVER with a preface like "यहाँ प्रस्तुत है…" / "Here is…" or any line describing this as a feature. Break into sections under SHORT natural subheadings (plain text — no #, no **) with 2–4 sentence paragraphs under each. Use a bulleted/numbered list ONLY for a genuine step-by-step or ONE short key-points summary — never turn explanation into bullets. Close with a forward-looking conclusion paragraph.
${sourcesRule}
• Do NOT invent specific figures, names or dates beyond what's given/established — keep unverified specifics general rather than fabricating.
• End with the conclusion itself — no note about word count or sources.
• Never refuse; always produce the article. Do NOT name other news outlets.
${framing}${magazineBlock}`;
    const fbRes = await generateText({
      model: drafting.model,
      prompt: fbPrompt,
      temperature: 0.3,
      maxOutputTokens,
    });
    return Response.json({
      titles: await headlinesFrom(fbRes.text),
      title: topic,
      body: fbRes.text.trim(),
      mode: parsed.data.mode,
      sources: hits.length,
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

  // The article is exactly what the left-side controls produce — no second
  // "humanize" rewrite pass (it was fighting the settings and hurting quality).
  const bodyText = body.text.trim();

  return Response.json({
    title: titles[0] ?? "",
    titles,
    body: bodyText,
    mode: parsed.data.mode,
    meta: {
      provider: drafting.providerKey,
      model: drafting.modelKey,
      temperature: TEMPERATURE,
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
