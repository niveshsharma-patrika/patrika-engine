import { getSession } from "@/lib/auth/session";
import { generateEngagementIdeas } from "@/lib/social/engagement";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST /api/social/engagement/ideas — a fresh batch of engagement-post ideas
 * for Patrika's news audience, grounded in current stories. Editor+admin. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "en" ? "en" : "hi";
  try {
    const result = await generateEngagementIdeas(lang);
    if (!result.ok) return Response.json(result, { status: 422 });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
