import { getSession } from "@/lib/auth/session";
import { pushQuickByte, type QuickByteCard } from "@/lib/quick-bytes/wordpress";
import { getCategorySlug } from "@/lib/cms-categories";
import { englishSlug } from "@/lib/wordpress";
import { getById, updateContent, updateMeta, markPublished, markFailed } from "@/lib/quick-bytes/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/quick-bytes/publish — save the latest content for a saved byte and
 *  publish it to WordPress. Stores the returned post id + URL on the row. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const headline = typeof body?.headline === "string" ? body.headline.trim() : "";
  const cards: QuickByteCard[] = (Array.isArray(body?.cards) ? body.cards : [])
    .map((c: unknown) => {
      const o = c as { title?: unknown; text?: unknown };
      return { title: typeof o?.title === "string" ? o.title.trim() : "", text: typeof o?.text === "string" ? o.text.trim() : "" };
    })
    .filter((c: QuickByteCard) => c.title && c.text)
    .slice(0, 5);

  if (!id) return Response.json({ error: "Need the saved Quick Byte id." }, { status: 400 });
  if (!headline || cards.length < 3) return Response.json({ error: "Need a headline and at least 3 cards." }, { status: 400 });

  const row = await getById(id);
  if (!row) return Response.json({ error: "Quick Byte not found." }, { status: 404 });

  await updateContent(id, headline, cards);

  // category ← desk's CMS slug (omitted if unmapped); slug ← English post slug.
  const category = (await getCategorySlug(row.magazine)) ?? undefined;
  const slug = (await englishSlug(headline)).slice(0, 100) || undefined;
  await updateMeta(id, slug ?? null, category ?? null);

  const result = await pushQuickByte({ magazine: row.magazine, headline, cards, category, slug });
  if (result.ok) {
    await markPublished(id, result.postId ?? null, result.url ?? null);
    return Response.json({ ok: true, postId: result.postId ?? null, url: result.url ?? null });
  }
  // "Not configured" isn't a failure of this byte — leave it a draft so it can be
  // published once WordPress is wired. Real errors mark it failed.
  if (!result.notConfigured) await markFailed(id, result.error ?? "push failed");
  return Response.json({ error: result.error, notConfigured: result.notConfigured ?? false }, { status: result.status });
}
