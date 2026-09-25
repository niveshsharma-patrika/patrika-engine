import { getSession } from "@/lib/auth/session";
import { pushQuickByte, type QuickByteCard } from "@/lib/quick-bytes/wordpress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/quick-bytes/publish — push a generated Quick Byte to WordPress.
 *  Any signed-in user. The WordPress endpoint/schema is pluggable (connect
 *  later) — until configured this returns a clear "not configured" message. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const magazine = typeof body?.magazine === "string" ? body.magazine.trim() : "";
  const headline = typeof body?.headline === "string" ? body.headline.trim() : "";
  const rawCards = Array.isArray(body?.cards) ? body.cards : [];
  const cards: QuickByteCard[] = rawCards
    .map((c: unknown) => {
      const o = c as { title?: unknown; text?: unknown };
      return { title: typeof o?.title === "string" ? o.title.trim() : "", text: typeof o?.text === "string" ? o.text.trim() : "" };
    })
    .filter((c: QuickByteCard) => c.title && c.text)
    .slice(0, 5);

  if (!headline || cards.length < 3) {
    return Response.json({ error: "Need a headline and at least 3 cards." }, { status: 400 });
  }

  const result = await pushQuickByte({ magazine, headline, cards });
  if (!result.ok) {
    return Response.json({ error: result.error, notConfigured: result.notConfigured ?? false }, { status: result.status });
  }
  return Response.json({ ok: true, postId: result.postId ?? null });
}
