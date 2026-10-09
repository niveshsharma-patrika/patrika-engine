import { getSession } from "@/lib/auth/session";
import { writeArticle, WORDS, type Lang, type ResearchResult } from "@/lib/research";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Defensively coerce the research object the client posts back. */
function coerceResearch(r: unknown): ResearchResult {
  const o = (r ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const timeline = Array.isArray(o.timeline)
    ? o.timeline.slice(0, 20).map((t) => {
        const e = (t ?? {}) as Record<string, unknown>;
        return { date: str(e.date), event: str(e.event) };
      }).filter((t) => t.event)
    : [];
  const sources = Array.isArray(o.sources)
    ? o.sources.slice(0, 20).map((s) => {
        const e = (s ?? {}) as Record<string, unknown>;
        return { title: str(e.title), url: str(e.url), publisher: str(e.publisher) };
      }).filter((s) => s.title || s.url)
    : [];
  const angles = Array.isArray(o.angles) ? o.angles.map(str).filter(Boolean).slice(0, 8) : [];
  return { summary: str(o.summary), timeline, angles, unverified: str(o.unverified), sources, found: Boolean(o.found) };
}

/** POST /api/research/article — write a grounded article from the incident +
 *  research. Signed-in users only. */
export async function POST(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const incident = typeof body?.incident === "string" ? body.incident.trim().slice(0, 4000) : "";
  const lang: Lang = body?.lang === "en" ? "en" : "hi";
  const angle = typeof body?.angle === "string" ? body.angle.trim().slice(0, 300) : "";
  const lengthKey = typeof body?.length === "string" && body.length in WORDS ? body.length : "standard";
  const targetWords = WORDS[lengthKey];
  const research = coerceResearch(body?.research);
  if (incident.length < 10) {
    return Response.json({ error: "Missing the incident details." }, { status: 400 });
  }

  try {
    const article = await writeArticle({ incident, lang, angle: angle || undefined, targetWords, research });
    return Response.json(article);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed.";
    const rateLimited = /quota|rate.?limit|exhausted|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : msg.slice(0, 200) },
      { status: 503 }
    );
  }
}
