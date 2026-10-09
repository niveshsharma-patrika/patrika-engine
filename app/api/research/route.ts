import { getSession } from "@/lib/auth/session";
import { researchIncident, type Lang } from "@/lib/research";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** POST /api/research — search the web for a described incident and return what
 *  we found (summary / timeline / sources / angles). Signed-in users only. */
export async function POST(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const incident = typeof body?.incident === "string" ? body.incident.trim().slice(0, 4000) : "";
  const lang: Lang = body?.lang === "en" ? "en" : "hi";
  if (incident.length < 10) {
    return Response.json({ error: "Describe the incident in a bit more detail." }, { status: 400 });
  }

  try {
    return Response.json(await researchIncident(incident, lang));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Research failed.";
    const rateLimited = /quota|rate.?limit|exhausted|429/i.test(msg);
    return Response.json(
      { error: rateLimited ? "AI rate limit — wait a few seconds and retry." : msg.slice(0, 200) },
      { status: 503 }
    );
  }
}
