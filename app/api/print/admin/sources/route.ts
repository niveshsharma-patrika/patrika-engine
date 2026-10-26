import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getAllPrintCities, cityFeedUrl } from "@/lib/print/cities";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

/** GET — the print desk's own (scope='print') sources, grouped by city. The
 *  24h count is computed live (sources.signals_24h is not maintained). */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { rows } = await pool.query(
      `SELECT src.id, src.name, src.url, src.language, src.city, src.is_active, src.last_sync,
              (SELECT count(*)::int FROM signals s
                WHERE s.source_id = src.id AND s.ingested_at > now() - interval '24 hours') AS signals_24h
         FROM sources src WHERE src.scope = 'print' ORDER BY src.city, src.language, src.name`
    );
    return Response.json({ sources: rows });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/** POST — add a feed for a city. Body: { city, language: hi|en, url? } (url
 *  defaults to the Google News per-city query). */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const language: "hi" | "en" = body?.language === "en" ? "en" : "hi";
  const customUrl = typeof body?.url === "string" ? body.url.trim() : "";
  const c = (await getAllPrintCities()).find((x) => x.key === city);
  if (!c) return Response.json({ error: "Unknown city" }, { status: 400 });
  const url = customUrl || cityFeedUrl(c.name_en, c.name_hi, language);
  try {
    if (!/^https?:\/\//i.test(url)) return Response.json({ error: "Bad url" }, { status: 400 });
    const isGn = /news\.google\.com/i.test(url);
    const { rows } = await pool.query(
      `INSERT INTO sources (name, source_type, url, language, desk, focus, is_active, scope, city)
       VALUES ($1, $2, $3, $4, $5, 'regional', true, 'print', $6)
       ON CONFLICT (url) DO NOTHING RETURNING id`,
      [`Local · ${c.name_en} (${customUrl ? "feed" : language === "hi" ? "हिंदी" : "English"})`, isGn ? "google_news" : "rss", url, language, `Local · ${c.name_en}`, c.key]
    );
    return Response.json({ ok: true, id: rows[0]?.id ?? null, existed: !rows[0] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/** PATCH — toggle a print source. Body: { id, is_active } */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  try {
    await pool.query(`UPDATE sources SET is_active = $2 WHERE id = $1 AND scope = 'print'`, [id, Boolean(body?.is_active)]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
