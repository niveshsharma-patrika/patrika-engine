import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const Body = z.object({
  platform: z.enum(["reddit", "x"]),
  query: z.string().min(1).max(120),
  label: z.string().max(120).optional(),
});

/** Normalise: strip r/ and @ / # so storage is consistent. */
function normalise(platform: string, raw: string): string {
  let q = raw.trim();
  if (platform === "reddit") return q.replace(/^\/?r\//i, "").replace(/[^\w]/g, "");
  return q.replace(/^[@#]/, "").trim();
}

export async function GET() {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.platform, s.query, s.label, s.is_active, s.last_crawled_at, s.last_error,
              (SELECT count(*) FROM social_trend_items i WHERE i.source_id = s.id) AS item_count
         FROM social_trend_sources s
        ORDER BY s.platform, s.query`
    );
    return Response.json({ sources: rows });
  } catch (err) {
    return Response.json(
      { sources: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const query = normalise(parsed.data.platform, parsed.data.query);
  if (!query) return Response.json({ error: "Enter a subreddit or keyword." }, { status: 400 });

  try {
    const { rows } = await pool.query(
      `INSERT INTO social_trend_sources (platform, query, label)
            VALUES ($1,$2,$3)
       ON CONFLICT (platform, query) DO NOTHING
         RETURNING id, platform, query, label, is_active, last_crawled_at, last_error`,
      [parsed.data.platform, query, parsed.data.label?.trim() || (parsed.data.platform === "reddit" ? `r/${query}` : query)]
    );
    if (rows.length === 0) return Response.json({ error: "Already a source." }, { status: 409 });
    return Response.json({ source: { ...rows[0], item_count: 0 } }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "insert failed" }, { status: 500 });
  }
}
