import { getSecret } from "@/lib/twitter/secrets";

/**
 * Publish a Quick Byte (glanceable swipe-story: headline + 3–5 title/text cards)
 * to WordPress. SEPARATE from every other WordPress flow — its own endpoint,
 * its own token, its own schema.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PLUGGABLE SEAM — the Quick Bytes WordPress endpoint, token and payload     │
 * │ schema are provided separately and will be connected later. When they      │
 * │ arrive, set the token/endpoint in Admin (or env) and adjust ONLY:          │
 * │   • QUICKBYTES_WP_HEADER (the auth header name), and                        │
 * │   • buildQuickBytePayload() (the exact JSON body / field names / status).   │
 * │ Everything else (secret storage, route, UI, status) already works.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Secrets live AES-GCM encrypted in integration_secrets (Admin) or env, never
 * in code/git and never sent to the browser.
 */
export const QUICKBYTES_WP_API_KEY = "quickbytes_wp_api_key";
export const QUICKBYTES_WP_ENDPOINT = "quickbytes_wp_endpoint";

const QUICKBYTES_WP_HEADER = process.env.QUICKBYTES_WP_HEADER || "X-API-Key";

export type QuickByteCard = { title: string; text: string };
export type QuickByte = { magazine: string; headline: string; cards: QuickByteCard[] };

export type QuickByteWpConfig = { apiKey: string; endpoint: string };

export async function getQuickBytesWpConfig(): Promise<QuickByteWpConfig | null> {
  const [apiKeySecret, endpointSecret] = await Promise.all([
    getSecret(QUICKBYTES_WP_API_KEY),
    getSecret(QUICKBYTES_WP_ENDPOINT),
  ]);
  const apiKey = (apiKeySecret || process.env.QUICKBYTES_WP_API_KEY || "").trim();
  const endpoint = (endpointSecret || process.env.QUICKBYTES_WP_ENDPOINT || "").trim();
  if (!apiKey || !endpoint) return null;
  return { apiKey, endpoint };
}

/**
 * PLUGGABLE — build the exact JSON body the Quick Bytes endpoint expects. This
 * is a sensible placeholder; replace it with the real schema when provided.
 */
export function buildQuickBytePayload(qb: QuickByte): unknown {
  return {
    type: "quick_byte",
    category: qb.magazine,
    lang: "hi",
    status: "publish",
    headline: qb.headline,
    cards: qb.cards.map((c) => ({ title: c.title, text: c.text })),
  };
}

export type QuickBytePushResult = { ok: boolean; status: number; postId?: string | null; error?: string; notConfigured?: boolean };

/** POST a Quick Byte. Retries on transient failure. Returns the post id/link. */
export async function pushQuickByte(qb: QuickByte): Promise<QuickBytePushResult> {
  const cfg = await getQuickBytesWpConfig();
  if (!cfg) {
    return { ok: false, status: 503, notConfigured: true, error: "Quick Bytes WordPress is not configured yet — add the endpoint + API key in Admin." };
  }
  const body = JSON.stringify(buildQuickBytePayload(qb));
  let last: QuickBytePushResult = { ok: false, status: 0, error: "not attempted" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", [QUICKBYTES_WP_HEADER]: cfg.apiKey },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      if (res.ok) {
        const d = (Array.isArray(data) ? data[0] : data) as { id?: number | string; post_id?: number | string; link?: string } | null;
        const postId = d?.id ?? d?.post_id;
        return { ok: true, status: res.status, postId: postId != null ? String(postId) : d?.link ?? null };
      }
      last = { ok: false, status: res.status, error: `WordPress returned ${res.status}: ${String(text).slice(0, 160)}` };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, status: 502, error: err instanceof Error ? err.message.slice(0, 200) : "Request to WordPress failed." };
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return last;
}
