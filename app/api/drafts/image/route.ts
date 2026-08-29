import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import { getApiKey } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Per-day image-generation quota by role (IST day). Admin is unlimited.
const IMAGE_QUOTA: Record<string, number> = { admin: Infinity, editor: 5, writer: 1 };

/**
 * POST /api/drafts/image — generate a hero image for an article from its
 * headline, via the OpenAI images API (gpt-image-1). Returns a data URL the
 * Editor shows inline + lets the user download. No storage.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const openaiKey = await getApiKey("openai");
  if (!openaiKey) {
    return Response.json(
      { error: "No OpenAI key configured (set it in Admin → API Keys, or in the env)." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as { title?: string; noText?: boolean } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
  // Olloi (cancer) images: generate a clean visual with NO baked-in text — Hindi
  // text renders incorrectly, so any wording is added later in design.
  const noText = body?.noText === true;
  if (!title) {
    return Response.json({ error: "A headline is needed to generate an image." }, { status: 400 });
  }

  // Enforce the per-day quota for the user's role (counted from IST midnight).
  const quota = IMAGE_QUOTA[session.role] ?? 1;
  if (Number.isFinite(quota)) {
    const istMidnight =
      Math.floor((Date.now() + 5.5 * 3_600_000) / 86_400_000) * 86_400_000 - 5.5 * 3_600_000;
    try {
      const used = await pool.query(
        "SELECT count(*)::int AS n FROM image_generations WHERE user_id = $1 AND created_at >= $2",
        [session.userId, new Date(istMidnight).toISOString()]
      );
      if ((used.rows[0]?.n ?? 0) >= quota) {
        return Response.json(
          { error: `Daily image limit reached — your role allows ${quota} per day. Try again tomorrow.` },
          { status: 429 }
        );
      }
    } catch {
      // if the count fails, don't block generation
    }
  }

  const model = process.env.IMAGE_MODEL ?? "gpt-image-1";
  const prompt = (noText
    ? [
        `Create a premium, ultra-realistic editorial FEATURE IMAGE / thumbnail, 3:2 landscape, for an Indian health-support article. Warm, calm, dignified and hopeful mood; authentic Indian context.`,
        `ARTICLE TOPIC: "${title}"`,
        `The image must clearly and directly match this topic with a strong, relevant real-world subject (people, hands, everyday objects, a calm care setting) — not abstract.`,
        `STYLE: photorealistic, soft natural light, shallow depth of field, clean composition with negative space, premium magazine look, gentle and reassuring — NOT clinical, scary or graphic.`,
        `ABSOLUTELY NO TEXT of any kind baked into the image — no words, letters, numbers, headline, caption, watermark, logo, borders or gibberish (especially NO Hindi / Devanagari text, which renders incorrectly). A clean visual ONLY; any wording is added later in design.`,
      ]
    : [
    `Create a premium, ultra-realistic Hindi news FEATURE IMAGE / thumbnail, 3:2 landscape, in the clean editorial style of top Indian digital news portals (Patrika, Aaj Tak, TV9, ABP). High-CTR, mobile-friendly and instantly understandable.`,
    `ARTICLE TOPIC: "${title}"`,
    `LAYOUT — split composition:`,
    `• LEFT ~40–45%: the main subject / person / object of the topic, photorealistic, sharp focus, realistic natural lighting.`,
    `• RIGHT ~55%: relevant supporting visuals — real objects, icons, documents, charts or illustrations that represent the topic.`,
    `HEADLINE: place a LARGE, BOLD Hindi (Devanagari) headline — a short, punchy version of the topic, 2–3 lines, 8–12 words max, occupying about 35–40% of the frame. Heavy poster-style font, strong contrast: dark blue (#153B7A), deep red (#D32F2F) and black, with a white outline and soft shadow for readability. Highlight any important NUMBER in yellow. Spell the Hindi exactly and clearly — no broken characters.`,
    `STYLE: photorealistic, bright natural light, slight warm grading, premium magazine look, clean white/cream background with a subtle gradient, soft depth of field, realistic shadows and reflections, DSLR / 8K detail, cinematic lighting, high dynamic range, balanced composition. Use ONLY visuals directly related to the topic (e.g. documents, bills, calculator, currency, healthy food, medical icons, government symbols, technology, charts, magnifying glass, light effects). Strong negative space, no clutter.`,
    `Accent colours: blue, red, green for health topics, yellow for emphasis, pink only for women's topics.`,
    `Do NOT add any logos, watermark, branding, borders, stock-photo look, extra paragraphs of text or gibberish letters — ONLY the short Hindi headline.`,
  ]).join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model, prompt, n: 1, size: "1536x1024" }),
    });
    if (!res.ok) {
      return Response.json(
        { error: `Image generation failed: ${(await res.text()).slice(0, 200)}` },
        { status: 502 }
      );
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = json.data?.[0];
    let b64 = item?.b64_json;
    if (!b64 && item?.url) {
      const img = await fetch(item.url);
      if (img.ok) b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    }
    if (!b64) return Response.json({ error: "No image returned." }, { status: 502 });
    // Log the successful generation for the quota counter (best-effort).
    try {
      await pool.query("INSERT INTO image_generations (user_id) VALUES ($1)", [session.userId]);
    } catch {
      /* ignore */
    }
    return Response.json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
