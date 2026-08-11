import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/social/saved — the desk's saved creative packs, newest first. */
export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) return Response.json({ posts: [] });
  try {
    // Deliberately NOT selecting s.image — it's a multi-MB data URL and 200 of
    // them would be a huge payload. The list exposes has_image; the blob is
    // fetched lazily per post via GET /api/social/saved/[id].
    const { rows } = await pool.query(
      `SELECT s.id, s.kind, s.source_ref, s.title, s.lang, s.pack, s.metrics,
              s.corroboration, (s.image IS NOT NULL) AS has_image,
              s.created_at, p.full_name AS created_by_name
         FROM social_saved_posts s
         LEFT JOIN profiles p ON p.id = s.created_by
        ORDER BY s.created_at DESC
        LIMIT 200`
    );
    return Response.json({ posts: rows });
  } catch (err) {
    return Response.json(
      { posts: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

/** POST /api/social/saved — save a generated creative pack to the library. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const kind = body.kind === "news" ? "news" : body.kind === "engagement" ? "engagement" : null;
  if (!kind) return Response.json({ error: "kind must be 'news' or 'engagement'" }, { status: 400 });
  if (!body.pack || typeof body.pack !== "object") {
    return Response.json({ error: "pack is required" }, { status: 400 });
  }
  const lang = body.lang === "en" ? "en" : "hi";
  // Reject an oversized image rather than silently truncating it mid-base64
  // (which would store a corrupt data URL). ~12M chars ≈ 9MB decoded, well
  // above a 1024×1024 PNG.
  if (typeof body.image === "string" && body.image.length > 12_000_000) {
    return Response.json({ error: "Image too large to save." }, { status: 413 });
  }
  const image = typeof body.image === "string" ? body.image : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO social_saved_posts (kind, source_ref, title, lang, pack, metrics, corroboration, image, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
       RETURNING id, created_at`,
      [
        kind,
        typeof body.source_ref === "string" ? body.source_ref.slice(0, 200) : null,
        typeof body.title === "string" ? body.title.slice(0, 500) : "",
        lang,
        JSON.stringify(body.pack),
        body.metrics ? JSON.stringify(body.metrics) : null,
        body.corroboration ? JSON.stringify(body.corroboration) : null,
        image,
        session.userId ?? null,
      ]
    );
    return Response.json({ ok: true, id: rows[0].id, created_at: rows[0].created_at });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "save failed" },
      { status: 500 }
    );
  }
}
