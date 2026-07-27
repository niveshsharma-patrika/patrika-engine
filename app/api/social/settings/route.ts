import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { hasSecret, setSecret } from "@/lib/twitter/secrets";
import { YT_API_KEY, META_TOKEN, META_IG_USER_ID } from "@/lib/social/types";

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
} as const;

const Body = z.object({
  youtube_api_key: z.string().min(4).max(500).optional(),
  meta_access_token: z.string().min(4).max(1000).optional(),
  meta_ig_user_id: z.string().min(1).max(100).optional(),
});

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [yt, meta, ig] = await Promise.all([
    hasSecret(YT_API_KEY), hasSecret(META_TOKEN), hasSecret(META_IG_USER_ID),
  ]);
  return Response.json({
    youtube_api_key: yt.set,
    meta_access_token: meta.set,
    meta_ig_user_id: ig.set,
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
