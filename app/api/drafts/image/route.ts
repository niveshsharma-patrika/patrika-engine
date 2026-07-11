import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/drafts/image — generate a hero image for an article from its
 * headline, via the OpenAI images API (gpt-image-1). Returns a data URL the
 * Editor shows inline + lets the user download. No storage.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "No OpenAI key configured on the server." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { title?: string } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) {
    return Response.json({ error: "A headline is needed to generate an image." }, { status: 400 });
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
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    return Response.json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
