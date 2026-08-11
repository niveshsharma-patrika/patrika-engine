import { getSession } from "@/lib/auth/session";
import { generateEngagementPack, FORMATS } from "@/lib/social/engagement";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const FORMAT_KEYS = new Set(FORMATS.map((f) => f.key));

/** POST /api/social/engagement/generate — expand one chosen engagement idea into
 * a ready-to-post creative pack. Editor+admin. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "en" ? "en" : "hi";
  const idea = body?.idea;
  if (!idea || typeof idea !== "object" || !FORMAT_KEYS.has(idea.format)) {
    return Response.json({ ok: false, error: "A valid idea is required." }, { status: 400 });
  }

  try {
    const result = await generateEngagementPack(
      {
        format: idea.format,
        title: { en: String(idea.title?.en ?? ""), hi: String(idea.title?.hi ?? "") },
        brief: { en: String(idea.brief?.en ?? ""), hi: String(idea.brief?.hi ?? "") },
        cta: { en: String(idea.cta?.en ?? ""), hi: String(idea.cta?.hi ?? "") },
        tie: idea.tie && idea.tie.trend_id
          ? { trend_id: String(idea.tie.trend_id), trend_title: String(idea.tie.trend_title ?? "") }
          : null,
      },
      lang
    );
    if (!result.ok) return Response.json(result, { status: 422 });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
