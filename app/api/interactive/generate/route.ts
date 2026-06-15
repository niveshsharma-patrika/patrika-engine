import { generateObject } from "ai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/interactive/generate — design + build a small, self-contained,
 * embeddable interactive HTML widget tailored to a story. The model picks the
 * widget type that best fits (weather slider, election timeline, sports
 * scoreboard, mini-chart, step-through explainer…) for engagement, grounded in
 * the story's real facts. The HTML is rendered in a sandboxed iframe client-side.
 */
const Body = z.object({
  trendId: z.string().min(1),
  lang: z.enum(["en", "hi"]).default("hi"),
});

type SigRow = {
  author: string | null;
  content: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  sources: { name: string } | { name: string }[] | null;
};

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { trendId, lang } = parsed.data;

  const supabase = createAdminClient();
  const { data: trend } = await supabase
    .from("trends")
    .select("id, title, section, desk")
    .eq("id", trendId)
    .maybeSingle();
  if (!trend) return Response.json({ error: "Story not found." }, { status: 404 });

  const { data: sigData } = await supabase
    .from("signals")
    .select("author, content, description, metadata, sources(name)")
    .eq("topic_id", trendId)
    .limit(24);

  const coverage: string[] = [];
  const seen = new Set<string>();
  for (const s of (sigData as SigRow[] | null) ?? []) {
    const meta = s.metadata ?? {};
    const metaTitle = typeof meta.title === "string" ? meta.title : "";
    const content = (s.content ?? "").trim();
    const headline = metaTitle || content.split(" — ")[0];
    const body = s.description || content.split(" — ").slice(1).join(" — ");
    const text = [headline, body].filter(Boolean).join(" — ").slice(0, 320);
    if (!text || seen.has(text.slice(0, 50))) continue;
    seen.add(text.slice(0, 50));
    coverage.push(`- ${text}`);
  }

  const resolved = await getModelFor("drafting");
  if (!resolved) {
    return Response.json(
      { error: "No AI model configured (set OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)." },
      { status: 503 }
    );
  }

  const t = trend as { title: string; section: string | null; desk: string | null };
  const langLine =
    lang === "hi"
      ? "All visible text in the widget must be in HINDI (Devanagari script)."
      : "All visible text in the widget must be in ENGLISH.";

  const prompt = `You are a senior front-end engineer and data-journalism designer. Given a news story and its facts, DESIGN and BUILD ONE small, self-contained, embeddable INTERACTIVE HTML widget that makes the story more engaging and is directly relevant to it.

Use your judgement to pick the most fitting + engaging widget type for THIS story. Examples (not a limit — choose what best fits and drives engagement):
- weather → interactive forecast with a slider / day toggle
- election or politics → results bars, a seat tracker, or a timeline scrubber
- sports → a scoreboard, standings table, or head-to-head comparator
- business / markets → a mini bar/line chart, or a "calculate your impact" tool
- explainer / how-it-works → a step-through, accordion, or before/after toggle
- anniversary / history → a timeline you can scrub
- a quiz / poll / "what would you do" interaction when it fits

HARD RULES:
- Output ONE self-contained HTML snippet: an inline <style> block + vanilla <script> (no frameworks, NO external libraries, NO CDNs, NO <link> tags, NO network/fetch calls, NO <img> from URLs — use CSS, emoji, or inline SVG only).
- It MUST run standalone inside a sandboxed iframe that allows ONLY scripts.
- NO HALLUCINATION: use ONLY real facts/numbers from the story below for anything presented as fact. Do NOT invent statistics. Where the widget needs values for interactivity (e.g. a slider range), make them clearly illustrative/exploratory, never stated as established fact.
- Make it genuinely INTERACTIVE (sliders, toggles, tabs, hover, buttons) and visually polished — modern, clean, fits ~600px wide, works on mobile. Keep it lightweight (target under ~12KB).
- ${langLine}

STORY: ${t.title}
SECTION: ${t.desk ?? t.section ?? "General"}
FACTS (the only real data you may use):
${coverage.join("\n") || "(no detailed facts captured — keep the widget conceptual and clearly illustrative)"}

Return { widgetType, title, html } where html is the FULL self-contained snippet.`;

  try {
    const { object, usage } = await generateObject({
      model: resolved.model,
      schema: z.object({
        widgetType: z.string(),
        title: z.string(),
        html: z.string(),
      }),
      prompt,
      temperature: 0.7,
    });
    return Response.json({
      widgetType: object.widgetType,
      title: object.title,
      html: object.html,
      meta: {
        model: resolved.modelKey,
        outputTokens: usage?.outputTokens ?? 0,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|429/i.test(msg);
    return Response.json(
      {
        error: rateLimited
          ? "AI rate limit hit — wait a few seconds and try again."
          : `Widget generation failed: ${msg.slice(0, 200)}`,
      },
      { status: 503 }
    );
  }
}
