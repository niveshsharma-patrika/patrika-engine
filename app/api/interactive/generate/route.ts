import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { getModelFor } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
// gpt-4.1 emitting a full ~20KB designed widget (heavier in Hindi) can take
// ~60-120s; give it generous room so it finishes instead of truncating/timing out.
export const maxDuration = 180;

/**
 * POST /api/interactive/generate — design + build a premium, self-contained,
 * embeddable interactive HTML graphic tailored to a story. The model picks the
 * format that best fits (photo lead, timeline, comparison slider, scoreboard,
 * mini-chart, step-through explainer…) for engagement, grounded in the story's
 * real facts AND its real article photos (signals.metadata.image). Rendered in
 * a sandboxed iframe client-side.
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
  if (!process.env.DATABASE_URL) {
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
  const images: { url: string; caption: string }[] = [];
  const seen = new Set<string>();
  const seenImg = new Set<string>();
  for (const s of (sigData as SigRow[] | null) ?? []) {
    const meta = s.metadata ?? {};
    const metaTitle = typeof meta.title === "string" ? meta.title : "";
    const content = (s.content ?? "").trim();
    const headline = metaTitle || content.split(" — ")[0];

    // Collect the REAL article photo (captured at fetch / og:image enrichment).
    const imgUrl = typeof meta.image === "string" ? meta.image : "";
    if (imgUrl && /^https?:\/\//.test(imgUrl) && !seenImg.has(imgUrl) && images.length < 6) {
      seenImg.add(imgUrl);
      images.push({ url: imgUrl, caption: (headline || "").slice(0, 100) });
    }

    const body = s.description || content.split(" — ").slice(1).join(" — ");
    const text = [headline, body].filter(Boolean).join(" — ").slice(0, 320);
    if (!text || seen.has(text.slice(0, 50))) continue;
    seen.add(text.slice(0, 50));
    coverage.push(`- ${text}`);
  }

  // Widgets are design-heavy + on-demand (low volume), so use a stronger model
  // than the per-tick default — gpt-4o by default, configurable via WIDGET_MODEL.
  // Falls back to the configured drafting model when no OpenAI key is present.
  let model: LanguageModel;
  let modelLabel: string;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    modelLabel = process.env.WIDGET_MODEL ?? "gpt-4.1";
    model = createOpenAI({ apiKey: openaiKey })(modelLabel);
  } else {
    const resolved = await getModelFor("drafting");
    if (!resolved) {
      return Response.json(
        { error: "No AI model configured (set OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)." },
        { status: 503 }
      );
    }
    model = resolved.model;
    modelLabel = resolved.modelKey;
  }

  const t = trend as { title: string; section: string | null; desk: string | null };
  const langLine =
    lang === "hi"
      ? "All visible text in the widget must be in HINDI (Devanagari script)."
      : "All visible text in the widget must be in ENGLISH.";
  const imageBlock = images.length
    ? images.map((im, i) => `[IMG${i + 1}] ${im.url}\n        caption: ${im.caption}`).join("\n")
    : "(no real photos available for this story — design a rich graphic with CSS gradients + inline SVG instead; do NOT use any <img> tags)";

  const prompt = `You are an award-winning editorial designer and senior front-end engineer at a world-class digital newsroom (think NYT / The Guardian / Bloomberg graphics desk). Build ONE self-contained, embeddable, visually STUNNING interactive HTML graphic for the story below. It must look premium and highly designed — never a plain bordered box.

Choose the format that best fits THIS story and maximises engagement + relevance (use your judgement): a hero photo lead with captions, an interactive timeline scrubber, a before/after or comparison slider, a live-feeling scoreboard, animated stat counters, a step-through explainer, a map-style layout, a poll/quiz — or a tasteful combination.

REAL PHOTOS — these are the ACTUAL images from this story; design around them as the centrepiece:
${imageBlock}
Rules for images:
- Use ONLY the exact URLs above in <img> or CSS background-image. NEVER invent, guess, modify, or shorten an image URL.
- Lead with the most relevant photo (e.g. the key person or object — for a SpaceX story that means the rocket / Elon Musk shot). Use the others as inline shots, a gallery, or section backgrounds with a subtle dark gradient overlay so any text on top stays readable.
- Add a tasteful caption/credit near photos.
- EVERY <img> MUST include onerror="this.onerror=null;this.style.display='none'" and sit on top of a CSS gradient fallback, so a blocked or expired image never breaks the layout.

DESIGN BAR (make it genuinely premium):
- Bold visual hierarchy, a refined type scale, generous spacing, and a cohesive colour palette matching the story's mood.
- Rich CSS: gradients, layered shadows, rounded corners, photo overlays, accent colours, smooth entrance + hover transitions/animations.
- Crisp inline SVG for any data, icons, diagrams, charts, trajectories, etc.
- Fully responsive: beautiful at ~600px wide and on mobile. System font stack only.

REQUIRED COMPONENTS — include every one the story can support (this is the FLOOR, not the ceiling):
1. A full-bleed HERO built on the lead photo, with a dark gradient overlay and a bold headline + the single most striking real fact/number laid over it.
2. A genuinely INTERACTIVE element wired with vanilla JS — a timeline scrubber, tabs, a comparison slider, a toggle, an animated count-up to a key number, or a short poll/quiz. It must visibly respond to the user.
3. A PHOTO STRIP or gallery that uses the OTHER provided images, each with a caption (hover-zoom or a clickable lightbox is a plus).
4. At least one crisp INLINE SVG graphic relevant to the story — a chart, progress ring, icon set, trajectory, map marker, gauge, etc.
5. Smooth entrance animations and hover states (@keyframes + transitions).

Make it a substantial, multi-section interactive FEATURE — rich, layered and polished, NEVER a single plain card. Aim for roughly 8–15KB of HTML (excluding image URLs); do not stop short with a minimal version.

AVOID THESE MISTAKES (they have happened before):
- Do NOT write any CSS that hides photos (e.g. NEVER \`img[onerror]{display:none}\` or similar). Photos must be VISIBLE by default; the per-image onerror only hides an individual broken one.
- Use fixed px sizes, NOT vh/vw units — the widget renders inside an auto-sized frame, so vh collapses or overflows.
- Every number, label, date or stat shown as real MUST come from the FACTS. Do NOT invent a slider range, price, or percentage. If a control needs a range with no factual basis, make it clearly hypothetical ("explore a scenario") and label it so.
- Any inline SVG must encode REAL information from the facts (a real proportion, comparison, timeline or progress) — never a meaningless decorative circle or "100%" placeholder.
- Wire EVERY interactive control with working vanilla JS so it visibly responds; no dead sliders or buttons.

HARD RULES:
- Output ONE self-contained snippet: an inline <style> block + a vanilla <script>. NO frameworks, NO external CSS/JS/CDNs, NO web fonts. The ONLY permitted external resources are the REAL image URLs listed above.
- Must run inside a sandboxed iframe (scripts allowed, same-origin denied): no fetch, no localStorage, no top navigation, no cookies.
- NO HALLUCINATION: every fact, number, name or quote presented as real MUST come from the FACTS below. Never fabricate statistics. Values used purely for interactivity may be exploratory but must be clearly labelled illustrative, not stated as fact.
- ${langLine}
- Keep it performant, but prioritise a rich, finished result over brevity (see the size target above).

STORY: ${t.title}
SECTION: ${t.desk ?? t.section ?? "General"}
FACTS (the only real data you may present as true):
${coverage.join("\n") || "(few facts captured — keep claims minimal and clearly illustrative)"}

OUTPUT FORMAT — respond with EXACTLY this and nothing else:
First line: TYPE: <a 2–4 word label for the widget you built>
Then a blank line, then the COMPLETE raw HTML snippet (inline <style> + markup + <script>). No markdown, no code fences, no commentary before or after.`;

  try {
    const { text, usage } = await generateText({
      model,
      prompt,
      temperature: 0.85,
      maxOutputTokens: 12000,
    });
    // Parse: optional leading "TYPE: …" line, then the raw HTML. Defensively
    // strip any markdown fences and trim to the first real HTML tag.
    let raw = text.trim();
    let widgetType = "Interactive feature";
    const typeMatch = raw.match(/^TYPE:\s*(.+)$/im);
    if (typeMatch) {
      widgetType = typeMatch[1].trim().slice(0, 40);
      raw = raw.slice(raw.indexOf(typeMatch[0]) + typeMatch[0].length);
    }
    raw = raw.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
    const htmlStart = raw.search(/<(?:div|section|style|main|article|header|figure|svg|h[1-6])/i);
    let html = (htmlStart >= 0 ? raw.slice(htmlStart) : raw).trim();
    // Safety net: if the model was cut off (token cap) mid-tag, close any
    // dangling <style>/<script> so the truncation can't break the whole iframe.
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    if (count(/<style\b/gi) > count(/<\/style>/gi)) html += "\n</style>";
    if (count(/<script\b/gi) > count(/<\/script>/gi)) html += "\n</script>";
    return Response.json({
      widgetType,
      title: t.title,
      html,
      meta: {
        model: modelLabel,
        images: images.length,
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
