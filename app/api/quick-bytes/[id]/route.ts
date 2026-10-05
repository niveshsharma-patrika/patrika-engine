import { getSession } from "@/lib/auth/session";
import { getById, updateContent, remove } from "@/lib/quick-bytes/store";
import type { QuickByteCard } from "@/lib/quick-bytes/wordpress";

export const dynamic = "force-dynamic";

function parseCards(input: unknown): QuickByteCard[] {
  return (Array.isArray(input) ? input : [])
    .map((c: unknown) => {
      const o = c as { title?: unknown; text?: unknown };
      return { title: typeof o?.title === "string" ? o.title.trim() : "", text: typeof o?.text === "string" ? o.text.trim() : "" };
    })
    .filter((c) => c.title || c.text)
    .slice(0, 5);
}

/** GET one saved Quick Byte (for the editor). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await getById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    byte: {
      id: row.id,
      magazine: row.magazine,
      headline: row.headline,
      cards: row.cards,
      status: row.status,
      wpUrl: row.wp_url,
      wpError: session.role === "admin" ? row.wp_error : null,
      slug: row.slug,
      category: row.category,
    },
  });
}

/** Save edits to a saved Quick Byte. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const headline = typeof body?.headline === "string" ? body.headline.trim() : "";
  const cards = parseCards(body?.cards);
  if (!headline || cards.length === 0) return Response.json({ error: "Need a headline and at least one card." }, { status: 400 });
  const row = await getById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  await updateContent(id, headline, cards);
  return Response.json({ ok: true });
}

/** Delete a saved Quick Byte. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await remove(id);
  return Response.json({ ok: true });
}
