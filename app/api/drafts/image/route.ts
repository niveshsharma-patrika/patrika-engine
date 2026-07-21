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
    `A realistic editorial news PHOTOGRAPH illustrating this story: "${title}". ` +
    `Photojournalistic press photo — natural lighting, real people and real settings, authentic Indian context, shot on a DSLR with shallow depth of field. ` +
    `NOT an illustration, NOT a cartoon, NOT 3D-rendered, NOT a painting. ` +
    `Absolutely NO text, no words, no letters, no numbers, no watermark, no logos.`;

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
