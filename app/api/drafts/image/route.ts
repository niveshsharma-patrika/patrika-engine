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

  const body = (await req.json().catch(() => null)) as { title?: string } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
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
  const prompt =
    `Create a vibrant, professional FEATURED IMAGE (news thumbnail / cover) for an Indian Hindi news article, in the polished style of leading Hindi news portals (Rajasthan Patrika / Amar Ujala). Landscape, 3:2.\n\n` +
    `ARTICLE TITLE: "${title}"\n\n` +
    `COMPOSITION:\n` +
    `• LEFT ~45% of the frame: the title as LARGE, BOLD Hindi (Devanagari) text — a SHORT, punchy version of the title above, about 4–8 words on 2–3 stacked lines. Heavy poster-style Devanagari font, multi-colour (deep navy blue + bright red + black), with a subtle white outline/glow so it stands out. Spell the Hindi correctly and clearly.\n` +
    `• RIGHT ~55%: a bright, photorealistic editorial illustration of the SUBJECT of the title — the relevant real-world objects, documents, devices or props on a clean surface, PLUS one simple graphic element that visually explains the topic (e.g. a chart, a magnifying glass, a clean icon). Blend realistic photography with tidy infographic touches.\n\n` +
    `STYLE: eye-catching, high-contrast, well-lit studio look, sharp and modern, trustworthy and uncluttered. A small relevant accent icon (e.g. a glowing bulb) is fine. ` +
    `Do NOT put any other paragraphs of text, gibberish letters, fake logos or watermarks anywhere — ONLY the short title text.`;

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
