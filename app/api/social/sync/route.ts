import { getSession } from "@/lib/auth/session";
import { runSocialSync } from "@/lib/social/sync";

export const maxDuration = 280;
export const dynamic = "force-dynamic";

/** POST /api/social/sync — "Sync now". Optional {id} to sync one account. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const onlyId = typeof body?.id === "string" ? body.id : undefined;

  try {
    const result = await runSocialSync("manual", onlyId);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
