import { getSession } from "@/lib/auth/session";
import { getApiKey } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/social/trends/[id]/image — render the creative-pack's `image_concept`
 * into an actual share-ready graphic via the OpenAI images API (gpt-image-1).
 * On-demand (a button in the Social dashboard), so it only costs an image when
 * the desk actually wants the visual. Returns a data URL; not persisted.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const openaiKey = await getApiKey("openai");
  if (!openaiKey) {
    return Response.json(
      { error: "No OpenAI key configured (Admin → API Keys)." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as { concept?: string } | null;
  const concept = typeof body?.concept === "string" ? body.concept.trim().slice(0, 600) : "";
  if (!concept) {
    return Response.json({ error: "No image concept provided." }, { status: 400 });
  }

  const model = process.env.IMAGE_MODEL ?? "gpt-image-1";
  const prompt = [
    `Create a premium, share-ready social-media graphic for an Indian news publisher (Patrika).`,
    `VISUAL CONCEPT: ${concept}`,
    `STYLE: photorealistic / editorial, clean and modern, strong single focal subject, bright natural lighting, shallow depth of field, high detail, social-first composition with clear negative space.`,
    `Authentic Indian context where relevant.`,
    `Do NOT bake in any text, headline, caption, watermark, logo or gibberish letters — a clean visual only (the desk overlays copy separately). No collage, no borders.`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" }),
      signal: AbortSignal.timeout(110_000),
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
    return Response.json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
