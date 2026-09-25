import { getSecret } from "@/lib/twitter/secrets";
import { SIGN_BY_KEY, signSlug } from "./signs";
import type { HoroscopeEntry } from "./generate";

/**
 * Auto-push the day's rashifal to WordPress — one post per sign PER LANGUAGE
 * (Hindi + English), published live. SEPARATE from the Patrika+ "Save to
 * WordPress draft" flow (lib/wordpress.ts): its own endpoint
 * (patrika/v2/post-astrology), its own X-API-Key token, fired automatically
 * from the nightly cron the moment each sign is generated.
 *
 * The token is read from the HOROSCOPE_WP_API_KEY env var (or the Admin secret
 * of the same name); the endpoint defaults here and is overridable.
 */
export const HOROSCOPE_WP_API_KEY = "horoscope_wp_api_key";
export const HOROSCOPE_WP_ENDPOINT = "horoscope_wp_endpoint";

const DEFAULT_ENDPOINT = "https://zimbea-develop.go-vip.net/wp-json/patrika/v2/post-astrology";
const HEADER = "X-API-Key";

export type HoroscopeWpConfig = { apiKey: string; endpoint: string };

export async function getHoroscopeWpConfig(): Promise<HoroscopeWpConfig | null> {
  const [apiKeySecret, endpointSecret] = await Promise.all([
    getSecret(HOROSCOPE_WP_API_KEY),
    getSecret(HOROSCOPE_WP_ENDPOINT),
  ]);
  const apiKey = (apiKeySecret || process.env.HOROSCOPE_WP_API_KEY || "").trim();
  const endpoint = (endpointSecret || process.env.HOROSCOPE_WP_ENDPOINT || DEFAULT_ENDPOINT).trim();
  if (!apiKey || !endpoint) return null;
  return { apiKey, endpoint };
}

function titleDate(forDate: string, lang: string): string {
  return new Date(`${forDate}T00:00:00+05:30`).toLocaleDateString(lang === "en" ? "en-IN" : "hi-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
  });
}

/** The exact per-sign, per-language payload the post-astrology endpoint expects. */
export function buildSignPayload(forDate: string, entry: HoroscopeEntry): unknown {
  const s = SIGN_BY_KEY[entry.sign];
  const en = entry.lang === "en";
  const signName = en ? (s?.en ?? entry.sign) : (s?.hi ?? entry.sign);
  const title = en
    ? `${signName} Horoscope ${titleDate(forDate, "en")}`
    : `${signName} राशिफल ${titleDate(forDate, "hi")}`;
  const q = en
    ? { color: `What is today's lucky colour for ${signName}?`, num: `What is today's lucky number for ${signName}?`, time: `What is the auspicious time today for ${signName}?` }
    : { color: `आज ${signName} राशि का शुभ रंग क्या है?`, num: `आज ${signName} राशि का शुभ अंक क्या है?`, time: `आज ${signName} राशि के लिए शुभ समय क्या है?` };
  return {
    type: "rashifal",
    category: signSlug(entry.sign),
    date: forDate,
    lang: entry.lang,
    status: "publish",
    title,
    content: "",
    rashifal_tab: {
      today_tab: {
        rashifal_content: entry.forecast,
        rashifal_zodiac_title: signName,
        rashifal_zodiac_content: entry.zodiacContent,
        rashifal_lucky_letters: en ? (s?.luckyLettersEn ?? "") : (s?.luckyLetters ?? ""),
        rashifal_lucky_color_code: entry.luckyColorCode,
        rashifal_lucky_color_name: entry.luckyColor,
        rashifal_lucky_number: entry.luckyNumber,
        rashifal_lucky_time: entry.luckyTime,
        rashifal_mood: entry.mood,
        rashifal_solution: entry.solution,
      },
      tomorrow_tab: { rashifal_content: "" },
      weekly_tab: { rashifal_content: "" },
      monthly_tab: { rashifal_content: "" },
      yearly_tab: { rashifal_content: "" },
    },
    faqs: [
      { question: q.color, answer: entry.luckyColor },
      { question: q.num, answer: entry.luckyNumber },
      { question: q.time, answer: entry.luckyTime },
    ],
  };
}

export type HoroscopePushResult = { ok: boolean; status: number; postId?: string | null; error?: string };

/** POST one sign's rashifal (in its language). Retries on transient failure. */
export async function pushSign(cfg: HoroscopeWpConfig, forDate: string, entry: HoroscopeEntry): Promise<HoroscopePushResult> {
  const body = JSON.stringify(buildSignPayload(forDate, entry));
  let last: HoroscopePushResult = { ok: false, status: 0, error: "not attempted" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", [HEADER]: cfg.apiKey },
        body,
        signal: AbortSignal.timeout(20_000),
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
      if (res.status < 500 && res.status !== 429) return last; // client error — don't retry
    } catch (err) {
      last = { ok: false, status: 502, error: err instanceof Error ? err.message.slice(0, 200) : "Request to WordPress failed." };
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return last;
}
