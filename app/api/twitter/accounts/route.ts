import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Watched X accounts. Editors and admins only — writers never see this section
 * (also enforced in middleware.ts so a hidden nav item can't be reached by URL).
 */
async function requireEditor() {
  const session = await getSession();
  return session?.role === "admin" || session?.role === "editor" ? session : null;
}

const CATEGORIES = ["figure", "company", "organisation", "government", "media"] as const;

const AccountBody = z.object({
  // Accept "@handle", a full profile URL, or a bare handle — normalised below.
  handle: z.string().min(1).max(80),
  display_name: z.string().max(120).optional(),
  category: z.enum(CATEGORIES).default("figure"),
  tier: z.number().int().min(1).max(3).default(2),
  desk: z.string().max(60).optional(),
  language: z.enum(["en", "hi"]).default("hi"),
});

/** "@PMOIndia", "https://x.com/PMOIndia?s=20" → "PMOIndia". */
export function normaliseHandle(input: string): string {
  let h = input.trim();
  const urlMatch = h.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/i);
  if (urlMatch) h = urlMatch[1];
  h = h.replace(/^@/, "").split(/[/?#\s]/)[0];
  return h;
}

export async function GET() {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.handle, a.display_name, a.category, a.tier, a.desk,
              a.language, a.is_active, a.last_crawled_at, a.consecutive_errors,
              a.last_error, a.tweets_total,
              (SELECT count(*) FROM tweets t
                WHERE t.account_id = a.id
                  AND t.crawled_at > now() - interval '24 hours') AS tweets_24h
         FROM twitter_accounts a
        ORDER BY a.is_active DESC, a.tier ASC, a.handle ASC`
    );
    return Response.json({ accounts: rows });
  } catch (err) {
    // Most likely cause: deploy/twitter.sql has not been run yet.
    return Response.json(
      { accounts: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await requireEditor())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = AccountBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const handle = normaliseHandle(parsed.data.handle);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return Response.json(
      { error: "Not a valid X handle (letters, numbers and _ only, max 15)." },
      { status: 400 }
    );
  }

  const { display_name, category, tier, desk, language } = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO twitter_accounts (handle, display_name, category, tier, desk, language)
            VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (handle) DO NOTHING
         RETURNING id, handle, display_name, category, tier, desk, language,
                   is_active, last_crawled_at, consecutive_errors, last_error,
                   tweets_total`,
      [handle, display_name?.trim() || null, category, tier, desk?.trim() || null, language]
    );
    if (rows.length === 0) {
      return Response.json({ error: `@${handle} is already being watched.` }, { status: 409 });
    }
    return Response.json({ account: { ...rows[0], tweets_24h: 0 } }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "insert failed" },
      { status: 500 }
    );
  }
}
