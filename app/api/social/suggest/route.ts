import { getSession } from "@/lib/auth/session";
import { generateSuggestions } from "@/lib/social/suggest";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** POST /api/social/suggest — AI "what to post next" from competitor performance. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(Number(body?.days) || 7, 30));
  const lang = body?.lang === "en" ? "en" : "hi";

  try {
    const result = await generateSuggestions(days, lang);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
