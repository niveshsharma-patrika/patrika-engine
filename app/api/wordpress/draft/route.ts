import { getSession } from "@/lib/auth/session";
import { bodyToHtml, englishSlug, postToWordPress } from "@/lib/wordpress";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * POST /api/wordpress/draft — save one generated Patrika+ article to WordPress
 * (as a draft). The article body is converted to HTML server-side; the key is
 * read from the encrypted store and never touches the client.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
  const article = typeof body?.body === "string" ? body.body : "";
  const short = typeof body?.short_description === "string" ? body.short_description.trim().slice(0, 500) : "";
  const slugIn = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!title || !article.trim()) {
    return Response.json({ error: "Need a title and an article body." }, { status: 400 });
  }

  const content = bodyToHtml(article);
  // Always an English slug: English titles slug directly, Hindi titles are
  // translated to English first (see englishSlug).
  const slug = (slugIn || (await englishSlug(title))).slice(0, 100);

  const result = await postToWordPress({
    title,
    content,
    short_description: short || undefined,
    slug: slug || undefined,
  });
  if (!result.ok) {
    return Response.json({ error: result.error, detail: result.data }, { status: result.status });
  }
  // Surface the created post's id / link if the plugin returned them.
  const d = result.data as { id?: number; link?: string; edit_link?: string } | Array<{ id?: number; link?: string }> | null;
  const first = Array.isArray(d) ? d[0] : d;
  return Response.json({
    ok: true,
    id: first?.id ?? null,
    link: (first as { link?: string; edit_link?: string } | null)?.link ?? (first as { edit_link?: string } | null)?.edit_link ?? null,
    data: result.data,
  });
}
