import { getSession } from "@/lib/auth/session";
import { generateCreative } from "@/lib/social/generate-creative";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST /api/social/trends/[id]/generate — make a creative pack for one trend. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "en" ? "en" : "hi";

  try {
    const result = await generateCreative(id, lang);
    if (!result.ok) return Response.json(result, { status: 422 });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
