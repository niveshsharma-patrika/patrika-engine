import { generateText } from "ai";
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
async function loadStyleAssets(storyType: string | null | undefined): Promise<{
  guidelines: string | null;
  samples: Array<{ title: string; body: string; story_type: string | null }>;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { guidelines: null, samples: [] };
  }
  const supabase = createAdminClient();

  // Guidelines: singleton, most-recent row
  const { data: g } = await supabase
    .from("style_guidelines")
    .select("content")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const guidelines =
    (g as { content: string } | null)?.content?.trim() || null;

  // Samples: prefer same story_type, fall back to newest 2
  type SampleRow = { title: string; body: string; story_type: string | null };
  let samples: SampleRow[] = [];
  if (storyType) {
    const { data } = await supabase
      .from("style_samples")
      .select("title, body, story_type")
      .eq("story_type", storyType)
      .order("created_at", { ascending: false })
      .limit(2);
    samples = (data as SampleRow[] | null) ?? [];
  }
  if (samples.length < 2) {
    const { data: extra } = await supabase
      .from("style_samples")
      .select("title, body, story_type")
      .order("created_at", { ascending: false })
      .limit(5);
    const haveTitles = new Set(samples.map((s) => s.title));
    for (const s of (extra as SampleRow[] | null) ?? []) {
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

  return { guidelines, samples };
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
सख्त नियम — ये कभी न तोड़ें
═══════════════════════════════════════════
• आज की तारीख: ${today} (भारतीय समय)
• केवल नीचे दिए गए "स्रोत संकेतों" में मौजूद तथ्यों का उपयोग करें।
• अपनी प्रशिक्षण डेटा (2024 या उससे पहले) से कोई नाम, तारीख, उद्धरण, या संख्या न जोड़ें।
• यदि कोई जानकारी संकेतों में नहीं है तो [विवरण आवश्यक] लिखें — आविष्कार न करें।
• यदि संकेत अपर्याप्त हैं, तो जवाब दें: "INSUFFICIENT INFORMATION: <क्या चाहिए>"
• तथ्यों का श्रेय कहानी के लोगों/संस्थानों को दें ("पुलिस ने कहा", "एयरलाइन ने बताया") — कभी भी उन समाचार आउटलेट्स/एजेंसियों को नहीं जिन्होंने इसे रिपोर्ट किया। "दैनिक भास्कर के अनुसार", "ABP ने बताया" जैसा कुछ न लिखें और न ही किसी प्रकाशन का नाम लें। पत्रिका अपनी रिपोर्ट लिख रही है।
═══════════════════════════════════════════`;
  }
  return `
═══════════════════════════════════════════
HARD RULES — never break these
═══════════════════════════════════════════
• Today's date: ${today} (IST). Your training data cutoff is irrelevant.
• Use ONLY facts present in the SOURCE SIGNALS below.
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
SAMPLE PATRIKA ARTICLES — mimic this structure, density, and voice
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
  // A specific AI-generated angle the editor selected in the drawer. When
  // present (mode "angle"), the draft is written to THIS angle instead of the
  // no-AI suggested_angle.
  angle: z
    .object({ title: z.string(), summary: z.string(), format: z.string() })
    .nullish(),
});

type SelectedAngle = { title: string; summary: string; format: string };

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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
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
  selectedAngle?: SelectedAngle | null
) {
  // The angle the draft follows: the editor's chosen AI angle if present,
  // otherwise the no-AI suggested angle on the trend.
  const angleText = selectedAngle
    ? `${selectedAngle.title} — ${selectedAngle.summary}`
    : trend.suggestedAngle ?? "(none specified)";
  const angleFormat = selectedAngle?.format ?? trend.storyType ?? "Analysis";
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
  const preamble = [styleBlock, grounding].filter(Boolean).join("\n\n");

  if (mode === "factual") {
    return {
      headlinePrompt: `${preamble}

${langDirective}

Write a single 8-14 word newspaper headline that reports what happened. Active voice, no clickbait, no opinion. Return ONLY the headline — no quotes, no explanation.

${baseContext}`,

      bodyPrompt: `${preamble}

${langDirective}

Write a 400-600 word straight news report covering this story as breaking news. Style: factual newspaper-of-record. Match the voice and structure of the Patrika sample articles above.

${baseContext}

Rules:
- Start with a DATELINE in caps (e.g. MUMBAI:, NEW DELHI:)
- Lede paragraph: who/what/when/where in one tight sentence
- Attribute claims to the people / institutions in the story (police, officials, the company) — NEVER to the news outlets or agencies that reported it
- Do NOT invent quotes or facts beyond the signals above
- Do NOT use the suggested editorial angle — this draft is the straight report
- End with: [Factual draft · edit and verify before publishing.]`,
    };
  }

  // mode === "angle"
  return {
    headlinePrompt: `${preamble}

${langDirective}

Write a single 8-14 word newspaper headline that captures the editorial ANGLE below, not just the surface event. Headlines that drive a reader to read because of the perspective. Return ONLY the headline.

TOPIC: ${trend.title}
EDITORIAL ANGLE: ${angleText}
STORY FORMAT: ${angleFormat}`,

    bodyPrompt: `${preamble}

${langDirective}

Write a 500-700 word piece in the format of ${angleFormat}. Match the structure, density, and voice of the Patrika sample articles above.

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
- End with: [Angle-driven draft (${angleFormat}) · edit and verify before publishing.]`,
  };
}

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
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

  // Load Patrika style assets (guidelines + matched samples) and build the
  // grounding-rules preamble that anchors the model to today's date + signals.
  const styleAssets = await loadStyleAssets(trend.storyType);
  const styleBlock = styleAssetsBlock(styleAssets);
  const grounding = groundingRules(parsed.data.lang);

  const { headlinePrompt, bodyPrompt } = buildPrompts(
    trend,
    parsed.data.mode,
    parsed.data.lang,
    styleBlock,
    grounding,
    parsed.data.angle
  );

  // Low temperature suppresses creative invention — the most reliable
  // single setting against the 2024-knowledge / hallucination problem.
  const TEMPERATURE = 0.2;

  const headline = await generateText({
    model: drafting.model,
    system: drafting.systemPrompt ?? undefined,
    prompt: headlinePrompt,
    temperature: TEMPERATURE,
  });

  const body = await generateText({
    model: drafting.model,
    system: drafting.systemPrompt ?? undefined,
    prompt: bodyPrompt,
    temperature: TEMPERATURE,
  });

  return Response.json({
    title: headline.text.trim().replace(/^["']|["']$/g, ""),
    body: body.text.trim(),
    mode: parsed.data.mode,
    meta: {
      provider: drafting.providerKey,
      model: drafting.modelKey,
      temperature: TEMPERATURE,
      inputTokens:
        (headline.usage?.inputTokens ?? 0) + (body.usage?.inputTokens ?? 0),
      outputTokens:
        (headline.usage?.outputTokens ?? 0) + (body.usage?.outputTokens ?? 0),
      style: {
        guidelinesUsed: Boolean(styleAssets.guidelines),
        guidelinesChars: styleAssets.guidelines?.length ?? 0,
        samplesUsed: styleAssets.samples.length,
        sampleStoryTypes: styleAssets.samples.map((s) => s.story_type ?? "—"),
      },
    },
  });
}
