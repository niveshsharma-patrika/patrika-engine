import { getSecret } from "@/lib/twitter/secrets";
import { SIGN_BY_KEY } from "./signs";
import type { HoroscopeEntry } from "./generate";

/**
 * Auto-push the day's rashifal to WordPress. This is SEPARATE from the Patrika+
 * "Save to WordPress draft" flow (lib/wordpress.ts): its own token, its own
 * endpoint, and it fires automatically from the nightly cron the moment the
 * horoscope is generated — no manual button, no draft step.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PLUGGABLE SEAM — the horoscope WordPress token + payload format are        │
 * │ supplied separately by the WordPress developer. When they arrive, edit     │
 * │ ONLY:                                                                       │
 * │   • HOROSCOPE_WP_HEADER  (the auth header name they require), and           │
 * │   • buildHoroscopePayload() (the exact JSON body: single vs per-sign,       │
 * │     field names, whether it publishes live or drafts).                      │
 * │ Everything else (secret storage, cron wiring, status tracking) stays.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Secrets live AES-GCM encrypted in integration_secrets (entered in Admin),
 * never in code/git and never sent to the browser.
 */
export const HOROSCOPE_WP_API_KEY = "horoscope_wp_api_key";
export const HOROSCOPE_WP_ENDPOINT = "horoscope_wp_endpoint";

// The auth header the horoscope plugin expects. Overridable via env until the
// developer confirms the exact name; then set the default here.
const HOROSCOPE_WP_HEADER = process.env.HOROSCOPE_WP_HEADER || "X-API-Key";

export type HoroscopeWpConfig = { apiKey: string; endpoint: string };

export async function getHoroscopeWpConfig(): Promise<HoroscopeWpConfig | null> {
  const [apiKey, endpointSecret] = await Promise.all([
    getSecret(HOROSCOPE_WP_API_KEY),
    getSecret(HOROSCOPE_WP_ENDPOINT),
  ]);
  const endpoint = (endpointSecret || process.env.HOROSCOPE_WP_ENDPOINT || "").trim();
  if (!apiKey || !endpoint) return null;
  return { apiKey, endpoint };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateHi(forDate: string): string {
  return new Date(`${forDate}T00:00:00+05:30`).toLocaleDateString("hi-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * PLUGGABLE — build the exact JSON body the horoscope plugin expects. The
 * default is one combined daily post that also carries the 12 signs as
 * structured data, so the plugin can render either way. Replace this with the
 * developer's format when provided (e.g. one post per sign → return an array).
 */
export function buildHoroscopePayload(forDate: string, entries: HoroscopeEntry[]): unknown {
  const rows = entries
    .map((e) => {
      const name = SIGN_BY_KEY[e.sign]?.hi ?? e.sign;
      return `<tr><th>${esc(name)}</th><td>${esc(e.forecast)}</td><td>${esc(e.shubhRang)}</td><td>${esc(e.shubhAnk)}</td><td>${esc(e.shubhSamay)}</td></tr>`;
    })
    .join("");
  const content =
    `<table><thead><tr><th>राशि</th><th>राशिफल</th><th>शुभ रंग</th><th>शुभ अंक</th><th>शुभ समय</th></tr></thead><tbody>${rows}</tbody></table>`;

  return {
    title: `आज का राशिफल — ${dateHi(forDate)}`,
    content,
    short_description: `${dateHi(forDate)} का सभी 12 राशियों का दैनिक राशिफल — शुभ रंग, शुभ अंक और शुभ समय के साथ।`,
    slug: `aaj-ka-rashifal-${forDate}`,
    date: forDate,
    signs: entries.map((e) => ({
      sign: e.sign,
      name_hi: SIGN_BY_KEY[e.sign]?.hi ?? e.sign,
      name_en: SIGN_BY_KEY[e.sign]?.en ?? e.sign,
      forecast: e.forecast,
      shubh_rang: e.shubhRang,
      shubh_ank: e.shubhAnk,
      shubh_samay: e.shubhSamay,
    })),
  };
}

export type HoroscopePushResult = { ok: boolean; status: number; postId?: string | null; error?: string; data?: unknown; notConfigured?: boolean };

/** POST the day's horoscope to WordPress. Retries a couple of times on transient
 *  failure. Returns the post id/link on success.
 *
 *  NOTE for the WordPress side: the payload carries a deterministic
 *  slug/`date` (`aaj-ka-rashifal-${forDate}`), so the plugin SHOULD upsert by
 *  that date — the retry pass and admin re-push can POST the same day more than
 *  once, and an insert-only endpoint would create duplicate posts. */
export async function pushHoroscopes(forDate: string, entries: HoroscopeEntry[]): Promise<HoroscopePushResult> {
  const cfg = await getHoroscopeWpConfig();
  if (!cfg) {
    return { ok: false, status: 503, notConfigured: true, error: "Horoscope WordPress is not configured — set the API key and endpoint in Admin." };
  }
  const body = JSON.stringify(buildHoroscopePayload(forDate, entries));

  let last: HoroscopePushResult = { ok: false, status: 0, error: "not attempted" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", [HOROSCOPE_WP_HEADER]: cfg.apiKey },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      if (res.ok) {
        const d = (Array.isArray(data) ? data[0] : data) as { id?: number | string; link?: string } | null;
        const postId = d?.id != null ? String(d.id) : d?.link ?? null;
        return { ok: true, status: res.status, postId, data };
      }
      last = { ok: false, status: res.status, data, error: `WordPress returned ${res.status}.` };
      // Only retry on transient server errors / rate limits.
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, status: 502, error: err instanceof Error ? err.message.slice(0, 200) : "Request to WordPress failed." };
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return last;
}
