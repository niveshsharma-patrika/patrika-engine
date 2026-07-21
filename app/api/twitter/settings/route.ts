import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getSecret, hasSecret, setSecret, X_AUTH_TOKEN } from "@/lib/twitter/secrets";

export const dynamic = "force-dynamic";

const SHIM_URL = process.env.TWITTER_SHIM_URL ?? "http://127.0.0.1:8791";

/**
 * The X auth_token cookie is a live credential for a logged-in X session, so
 * only admins may read its status or replace it — and the value itself is
 * NEVER returned to the client, only whether one is set.
 */
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

const Body = z.object({ auth_token: z.string().min(10).max(500) });

// Spend guard. Every tweet triggers a web-search-grounded generation — the
// expensive call — so these caps are what stop tweet volume quietly running up
// an AI bill. Admin-only for that reason.
const CapsBody = z.object({
  auto_draft: z.boolean().optional(),
  daily_cap: z.number().int().min(0).max(1000).optional(),
  per_account_daily_cap: z.number().int().min(0).max(500).optional(),
  per_run_cap: z.number().int().min(1).max(20).optional(),
  target_words: z.number().int().min(150).max(2000).optional(),
});

/** GET — is a cookie set, is the Python shim alive, and what are the caps? */
export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await hasSecret(X_AUTH_TOKEN);

  let shim: { up: boolean; scweet: boolean; error: string | null } = {
    up: false, scweet: false, error: null,
  };
  try {
    const res = await fetch(new URL("/health", SHIM_URL), {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean; scweet?: boolean };
      shim = { up: true, scweet: !!json.scweet, error: null };
    } else {
      shim.error = `shim returned ${res.status}`;
    }
  } catch (err) {
    shim.error = err instanceof Error ? err.message : "unreachable";
  }

  let caps: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT auto_draft, daily_cap, per_account_daily_cap, per_run_cap, target_words
         FROM twitter_settings WHERE id = true LIMIT 1`
    );
    caps = rows[0] ?? null;
  } catch {
    // twitter-phase2.sql not run yet
  }

  return Response.json({ token, shim, caps });
}

/** PATCH — update the spend caps / auto-draft switch. */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = CapsBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Column names come from the zod schema above, never straight from the body.
  const setSql = fields.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const values = fields.map(([, v]) => v);

  try {
    const { rows } = await pool.query(
      `UPDATE twitter_settings SET ${setSql}, updated_at = now()
        WHERE id = true
    RETURNING auto_draft, daily_cap, per_account_daily_cap, per_run_cap, target_words`,
      values
    );
    return Response.json({ caps: rows[0] ?? null });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 }
    );
  }
}

/** PUT — store/replace the cookie (write-only). */
export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "auth_token is required" }, { status: 400 });
  }

  if (!process.env.KEY_ENCRYPTION_SECRET) {
    return Response.json(
      { error: "KEY_ENCRYPTION_SECRET is not set on the server — cannot store the cookie." },
      { status: 503 }
    );
  }

  try {
    await setSecret(X_AUTH_TOKEN, parsed.data.auth_token.trim());
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to store token" },
      { status: 500 }
    );
  }
}

/** POST — verify the stored cookie actually works, without waiting for cron. */
export async function POST() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookie = await getSecret(X_AUTH_TOKEN);
  if (!cookie) {
    return Response.json({ ok: false, error: "No auth token stored yet." }, { status: 400 });
  }

  try {
    const url = new URL("/timeline", SHIM_URL);
    url.searchParams.set("handle", "PMOIndia");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cookie },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { ok: false, error: `Shim ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const json = (await res.json()) as { count?: number };
    return Response.json({ ok: true, tweets: json.count ?? 0 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "request failed" },
      { status: 502 }
    );
  }
}
