import { getSession } from "@/lib/auth/session";
import { getEntriesForDate, runHoroscope, istDate } from "@/lib/horoscope/run";
import { SIGN_BY_KEY } from "@/lib/horoscope/signs";

export const dynamic = "force-dynamic";
export const maxDuration = 200;

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** GET /api/horoscope?date=YYYY-MM-DD — the day's rashifal for all 12 signs
 *  (default: today IST). Any signed-in user. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || istDate();
  const lang = url.searchParams.get("lang") === "en" ? "en" : "hi";
  if (!isDate(date)) return Response.json({ error: "Bad date" }, { status: 400 });

  const rows = await getEntriesForDate(date); // all languages
  const entries = rows
    .filter((r) => r.lang === lang)
    .map((r) => ({
      sign: r.sign,
      nameHi: SIGN_BY_KEY[r.sign]?.hi ?? r.sign,
      nameEn: SIGN_BY_KEY[r.sign]?.en ?? r.sign,
      forecast: r.forecast,
      shubhRang: r.shubh_rang,
      shubhAnk: r.shubh_ank,
      shubhSamay: r.shubh_samay,
      colorCode: r.lucky_color_code,
      mood: r.mood,
      solution: r.solution,
      zodiacContent: r.zodiac_content,
      luckyLetters: (lang === "en" ? SIGN_BY_KEY[r.sign]?.luckyLettersEn : SIGN_BY_KEY[r.sign]?.luckyLetters) ?? "",
    }));
  // Push status aggregated across BOTH languages (a day is "pushed" only when
  // every hi + en post is live).
  const wpStatus =
    rows.length === 0 ? "none"
    : rows.every((r) => r.wp_status === "pushed") ? "pushed"
    : rows.some((r) => r.wp_status === "failed") ? "failed"
    : rows.every((r) => r.wp_status === "skipped") ? "skipped"
    : "pending";
  const wpError = session.role === "admin" ? (rows.find((r) => r.wp_error)?.wp_error ?? null) : null;
  const updatedAt = rows.map((r) => r.updated_at).filter(Boolean).sort().pop() ?? null;

  return Response.json({ date, today: istDate(), lang, count: entries.length, wpStatus, wpError, updatedAt, entries });
}

/** POST /api/horoscope — admin only. { action: "regenerate" | "repush", date? }.
 *  Manual controls for the first run and fixes. */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const date = isDate(body?.date) ? body.date : istDate();
  const repush = body?.action === "repush";

  try {
    const summary = await runHoroscope(date, repush ? { repushOnly: true } : { regenerate: true });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Failed" },
      { status: 500 }
    );
  }
}
