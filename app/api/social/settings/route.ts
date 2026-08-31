import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { hasSecret, setSecret, X_AUTH_TOKEN } from "@/lib/twitter/secrets";
import {
  YT_API_KEY, META_TOKEN, META_IG_USER_ID, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET,
} from "@/lib/social/types";
import { WP_API_KEY, WP_ENDPOINT } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

/**
 * Platform credentials for the social center. Admin only — these are live API
 * credentials. Values are never returned to the client, only whether each is
 * set. Stored AES-GCM encrypted via the shared integration_secrets store.
 *
 * X reuses the Twitter cookie (Twitter → Settings), so it is not set here.
 */
async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

const KEYS = {
  youtube_api_key: YT_API_KEY,
  meta_access_token: META_TOKEN,
  meta_ig_user_id: META_IG_USER_ID,
  x_auth_token: X_AUTH_TOKEN,
  reddit_client_id: REDDIT_CLIENT_ID,
  reddit_client_secret: REDDIT_CLIENT_SECRET,
  wordpress_api_key: WP_API_KEY,
  wordpress_endpoint: WP_ENDPOINT,
} as const;

const Body = z.object({
  youtube_api_key: z.string().min(4).max(500).optional(),
  meta_access_token: z.string().min(4).max(1000).optional(),
  meta_ig_user_id: z.string().min(1).max(100).optional(),
  x_auth_token: z.string().min(10).max(500).optional(),
  reddit_client_id: z.string().min(4).max(100).optional(),
  reddit_client_secret: z.string().min(4).max(100).optional(),
  wordpress_api_key: z.string().min(8).max(500).optional(),
  wordpress_endpoint: z.string().url().max(500).optional(),
});

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [yt, meta, ig, x, rid, rsec, wpk, wpe] = await Promise.all([
    hasSecret(YT_API_KEY), hasSecret(META_TOKEN), hasSecret(META_IG_USER_ID),
    hasSecret(X_AUTH_TOKEN), hasSecret(REDDIT_CLIENT_ID), hasSecret(REDDIT_CLIENT_SECRET),
    hasSecret(WP_API_KEY), hasSecret(WP_ENDPOINT),
  ]);
  return Response.json({
    youtube_api_key: yt.set,
    meta_access_token: meta.set,
    meta_ig_user_id: ig.set,
    x_auth_token: x.set,
    reddit_client_id: rid.set,
    reddit_client_secret: rsec.set,
    wordpress_api_key: wpk.set,
    wordpress_endpoint: wpe.set,
  });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.KEY_ENCRYPTION_SECRET) {
    return Response.json(
      { error: "KEY_ENCRYPTION_SECRET is not set on the server — cannot store credentials." },
      { status: 503 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined) as Array<
    [keyof typeof KEYS, string]
  >;
  if (entries.length === 0) return Response.json({ error: "Nothing to save" }, { status: 400 });

  try {
    for (const [field, value] of entries) {
      await setSecret(KEYS[field], value.trim());
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to store" },
      { status: 500 }
    );
  }
}
