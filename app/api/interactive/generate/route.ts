import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { getModelFor, getApiKey } from "@/lib/ai/provider";

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
  const openaiKey = await getApiKey("openai");
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
    : "(no real photos available for this story — illustrate with inline SVG/canvas instead; do NOT use any <img> tags)";

  const prompt = `You are an expert front-end engineer and news designer at Patrika (patrika.com). Build ONE self-contained, interactive HTML widget to embed inside a news article. Its purpose is to make readers DO something the static article can only describe.

Work through steps 1–2 SILENTLY in your head. Do not print your reasoning — the only thing you output is the HOOK line, the TYPE line, and the HTML.

STEP 1 — READ THE SOURCE. From the FACTS below, extract: the real hook, every concrete data point (numbers, dates, names, places, sequences), and what is fact vs belief/allegation/estimate.

STEP 2 — FIND THE HOOK (this decides quality). Answer in one sentence: "What can a reader DO here that a static graphic cannot show them?" Putting the article in tabs is NOT a hook. Match the story shape to an interaction:
- ends with "you don't need X" → let them pick their case and prove it to them personally
- data varies by region → interactive choropleth map
- things happen at places in sequence → route map / journey
- a process races a deadline → a moving clock
- two states of one thing (normal vs exception) → a flip that recolours the whole card
- one quantity dwarfs the rest → a proportional visual where the smallness is the point
- a life / history → a timeline they move through
- a structure with named parts → a tappable diagram of the real thing
Take the visual language FROM the subject (a fuel story looks like a pump; a temple like sandstone; a funeral is sombre) — never a generic template, never a stock dashboard look, never reuse a previous widget's look.

STEP 3 — BUILD.
SIZE IS THE BINDING CONSTRAINT (this is where widgets fail most often):
- It MUST fit ONE mobile screen with NO internal scroll. NEVER use overflow-y:auto to fix height.
- At 360×640 the card must be ≤ 640px tall IN ITS TALLEST STATE. A widget has many states — mentally click through EVERY tab/mode/step/accordion and take the MAX. The default state is almost never the tallest; this is the #1 bug.
- Also work at 393×852 and 430×932. Healthy range 520–640px. Card max-width 460px.
- Zero horizontal overflow at all three widths (scrollWidth − clientWidth must be 0). No truncated tab/chip/button/name labels.
- When over budget, trim in THIS order: spacing → longest text string → media size → collapse redundant elements → cut a feature → font size LAST. This desk asks for BIGGER type, so shrinking it is the wrong reflex.

TECHNICAL RULES:
- ONE self-contained snippet: inline <style> + markup + vanilla <script>. No build step, no frameworks, no CDNs.
- Runs in a sandboxed iframe (scripts allowed, same-origin denied): no fetch, no localStorage, no cookies, no top navigation.
- Use container-type:inline-size on the root and cqw units. EVERY font size must be clamp(MINpx, N cqw, MAXpx). NEVER vw/vh — this lives in an article column, where vh collapses or overflows.
- Scope EVERY CSS selector under one root class (e.g. .pk-w) so article styles can't leak either way.
- Give swapping panels a min-height so the card doesn't jump between states.
- Put ALL content in ONE editable data array at the top of the <script>, marked with a comment so the desk can edit copy without touching logic.
- Keyboard accessible: tabindex, Enter/Space handlers, aria-* labels.
- min-width/min-height floors so small dots/icons/hit targets survive 360px.
- Respect prefers-reduced-motion (no autoplay, no transitions).
- Desktop keeps natural height, no scroll trap.
- Wire EVERY control with working vanilla JS so it visibly responds — no dead sliders or buttons.
- Illustrate with inline SVG/canvas and draw icons FROM the subject. Any SVG must encode REAL information from the facts (a real proportion, comparison, timeline, progress) — never a decorative circle or a "100%" placeholder.

TYPOGRAPHY — ${langLine}
- Light theme. Use Noto Sans Devanagari for everything; add Noto Serif Devanagari for headings ONLY if the tone is heritage/serious. One superfamily so nothing clashes. Load it with:
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&display=swap">
  and ALWAYS declare a fallback stack after it so the widget degrades cleanly if fonts are blocked.
- NEVER set Devanagari in a Latin-only font (mono faces, Fraunces, etc.) → it breaks into tofu/broken clusters. Mono is fine for digits/Latin only.
- NEVER use wide letter-spacing on Devanagari (≤ .04em) — it pulls conjuncts apart.
- Avoid condensed display faces (poor Hindi legibility).
- Devanagari line-height 1.4–1.55 for Noto. Leave headroom so matras are never clipped — inside overflow:hidden use 1.6+.
- Generous font sizes; when unsure, bigger.
- Text contrast ≥ 4.5:1 — the faint footer/caption line is the usual failure.

STEP 4 — EDITORIAL RULES (Indian publication standards, mandatory):
- NEVER invent data. No made-up prices, percentages, scores or dates. If it isn't in the FACTS and isn't simple arithmetic from them, leave it out. A control that needs a range with no factual basis must be clearly framed as exploring a scenario and labelled illustrative — never stated as fact.
- Preserve hedging language EXACTLY ("कथित" / alleged / estimated / "मान्यता है"). Never quietly upgrade an allegation into a fact. Present beliefs as beliefs.
- Maps of India MUST show the official boundary — full Jammu & Kashmir / Ladakh including PoK and Aksai Chin, plus Arunachal Pradesh. Most open datasets draw the de-facto line and are unpublishable: the northern extent must reach ~37°N and Ladakh must extend east to ~80°E. If you cannot draw a compliant boundary from the facts you have, choose a NON-MAP interaction instead.
- Health content: no invented risk models; the logic must never be backwards (a specific symptom must not score below a non-specific one); keep disclaimers and "screening, not diagnosis" framing.
- Religion / politics / communal topics: neutral, factual, attributed, never sensationalised.
- Real people and tragedy: dignified and restrained — no playful animation, no invented outcomes.
- Add a short source/caveat line wherever data needs it (estimates, ranges, shifting dates, schematic diagrams) and say plainly what is schematic.
- If there is scoring/matching logic, mentally simulate EVERY input combination before emitting, to confirm it isn't backwards.

PHOTOS (optional — only if one genuinely earns its height against the 640px budget):
${imageBlock}
- Use ONLY the exact URLs above in <img> or CSS background-image. NEVER invent, guess, modify or shorten an image URL.
- At most ONE photo. The interaction, not the photo, is the point — if the photo would push the card past budget, drop it.
- EVERY <img> MUST include onerror="this.onerror=null;this.style.display='none'" and sit on a CSS gradient fallback so a blocked image never breaks the layout. Never write CSS that hides photos by default.
- Check provenance: if a caption suggests the image is AI-generated or प्रतीकात्मक/symbolic, do NOT present it as a real photo of the event — label it, or leave it out.

AVOID: wrapping the article in tabs and calling it interactive; reusing a previous widget's look; overflow-y:auto to fix height; shrinking fonts to fit; designing only for the default state; decorative fonts that hurt Hindi legibility; inventing a statistic to fill a panel; explaining your own editorial process to readers in the footer.

STORY: ${t.title}
SECTION: ${t.desk ?? t.section ?? "General"}
FACTS (the only real data you may present as true):
${coverage.join("\n") || "(few facts captured — keep claims minimal and clearly illustrative)"}

OUTPUT FORMAT — respond with EXACTLY this and nothing else:
Line 1: HOOK: <the one sentence from step 2 — what the reader can DO>
Line 2: TYPE: <a 2–4 word label for the widget you built>
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
    let hook = "";
    // The model leads with "HOOK: …" (what the reader can DO) then "TYPE: …".
    const hookMatch = raw.match(/^HOOK:\s*(.+)$/im);
    if (hookMatch) {
      hook = hookMatch[1].trim().slice(0, 240);
      raw = raw.slice(raw.indexOf(hookMatch[0]) + hookMatch[0].length);
    }
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
      hook,
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
