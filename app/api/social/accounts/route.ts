import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Social command center — competitor/agency pages. Editors + admins. */
async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const Body = z.object({
  platform: z.enum(["youtube", "x", "instagram", "facebook"]),
  handle: z.string().min(1).max(120),
  display_name: z.string().max(120).optional(),
  kind: z.enum(["competitor", "agency", "own"]).default("competitor"),
});

/** Normalise a handle/URL to a bare identifier per platform. */
function normalise(platform: string, raw: string): string {
  let h = raw.trim();
  if (platform === "youtube") {
    // keep channel id / @handle / url intact — the fetcher resolves it
    return h.replace(/\s+/g, "");
  }
  h = h.replace(/^@/, "");
  h = h.replace(/https?:\/\/(www\.)?(x\.com|twitter\.com|instagram\.com|facebook\.com)\//i, "");
  return h.split(/[/?#]/)[0];
}

export async function GET() {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.platform, a.handle, a.display_name, a.kind, a.is_active,
              a.followers, a.last_synced_at, a.last_error,
              (SELECT count(*) FROM social_posts p WHERE p.account_id = a.id) AS post_count,
              (SELECT round(avg(virality_score)) FROM social_posts p
                WHERE p.account_id = a.id AND p.posted_at > now() - interval '30 days') AS avg_virality
         FROM social_accounts a
        ORDER BY a.is_active DESC, a.platform, a.handle`
    );
    return Response.json({ accounts: rows });
  } catch (err) {
    return Response.json(
      { accounts: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await requireEditor())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });

  const { platform, kind } = parsed.data;
  const handle = normalise(platform, parsed.data.handle);
  if (!handle) return Response.json({ error: "Enter a handle or URL." }, { status: 400 });

  try {
    const { rows } = await pool.query(
      `INSERT INTO social_accounts (platform, handle, display_name, kind)
            VALUES ($1,$2,$3,$4)
       ON CONFLICT (platform, handle) DO NOTHING
         RETURNING id, platform, handle, display_name, kind, is_active, followers,
                   last_synced_at, last_error`,
      [platform, handle, parsed.data.display_name?.trim() || null, kind]
    );
    if (rows.length === 0) {
      return Response.json({ error: "Already tracking this account." }, { status: 409 });
    }
    return Response.json({ account: { ...rows[0], post_count: 0, avg_virality: null } }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "insert failed" },
      { status: 500 }
    );
  }
}
