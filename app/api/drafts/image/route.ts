import { generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import { getImageRouting } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Per-day image-generation quota by role (IST day). Admin is unlimited.
const IMAGE_QUOTA: Record<string, number> = { admin: Infinity, editor: 5, writer: 1 };

/**
 * POST /api/drafts/image — generate a hero image for an article from its
 * headline. Provider (OpenAI gpt-image-1 / Google Imagen) is chosen in
 * Admin → Model routing; the key comes from Admin → API Keys. Returns a data URL.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const routing = await getImageRouting();
  if (!routing) {
    return Response.json(
      { error: "No image provider key configured — set OpenAI or Google in Admin → API Keys." },
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

  const prompt =
    `A realistic editorial news PHOTOGRAPH illustrating this story: "${title}". ` +
    `Photojournalistic press photo — natural lighting, real people and real settings, authentic Indian context, shot on a DSLR with shallow depth of field. ` +
    `NOT an illustration, NOT a cartoon, NOT 3D-rendered, NOT a painting. ` +
    `Absolutely NO text, no words, no letters, no numbers, no watermark, no logos.`;

  try {
    const imageModel =
      routing.providerKey === "google"
        ? createGoogleGenerativeAI({ apiKey: routing.apiKey }).image(routing.modelKey)
        : createOpenAI({ apiKey: routing.apiKey }).image(routing.modelKey);

    // gpt-image-1 takes an exact pixel size; Imagen takes an aspect ratio.
    const { image } =
      routing.providerKey === "google"
        ? await generateImage({ model: imageModel, prompt, aspectRatio: "16:9" })
        : await generateImage({ model: imageModel, prompt, size: "1536x1024" });

    // Log the successful generation for the quota counter (best-effort).
    try {
      await pool.query("INSERT INTO image_generations (user_id) VALUES ($1)", [session.userId]);
    } catch {
      /* ignore */
    }

    return Response.json({ image: `data:${image.mediaType ?? "image/png"};base64,${image.base64}` });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
