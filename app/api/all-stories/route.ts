import { pool } from "@/lib/db";
import { decodeEntities, canonicalPublisherKey } from "@/lib/clustering/lexical";

export const dynamic = "force-dynamic";

/**
 * GET /api/all-stories — a total-coverage log (NOT trending): every distinct
 * story any publication carried in the last 24h, deduped by title so each real
 * story appears once (with a count of how many outlets covered it), grouped by
 * the IST hour it first appeared. Astrology / lottery / rate filler is dropped.
 */

const HOUR_MS = 3600 * 1000;
const IST_OFFSET = 5.5 * HOUR_MS;
const FUTURE_SLACK_MS = 15 * 60 * 1000;

const FILLER_PATTERNS: RegExp[] = [
  /\b(horoscope|rashifal|zodiac|astrolog\w*|numerolog\w*|tarot|panchang)\b/i,
  /राशिफल|पंचांग|अंक\s*ज्योतिष/,
  /\blottery\b.{0,30}\b(result|today|sambad|draw|number)\b/i,
  /\b(kerala|nagaland|sikkim|dear)\s+lottery\b/i,
  /\b(gold|silver|petrol|diesel|cng)\s+(rate|price)s?\s+today\b/i,
  /आज के (भाव|रेट|दाम)|आज का (भाव|रेट|दाम)/,
];
function isFiller(title: string): boolean {
  const t = (title || "").trim();
  return t ? FILLER_PATTERNS.some((rx) => rx.test(t)) : false;
}

type Row = {
  content: string | null;
  url: string | null;
  author: string | null;
  publisher_section: string | null;
  published_at: string | null;
  ingested_at: string | null;
  source_name: string | null;
};

function effMs(r: Row, nowMs: number): number {
  const p = r.published_at ? new Date(r.published_at).getTime() : NaN;
  if (Number.isFinite(p) && p <= nowMs + FUTURE_SLACK_MS) return p;
  const ing = r.ingested_at ? new Date(r.ingested_at).getTime() : NaN;
  return Number.isFinite(ing) ? Math.min(ing, nowMs) : nowMs;
}

const extractTitle = (content: string): string =>
  decodeEntities((content || "").split(" — ")[0]).trim().slice(0, 200);
const titleKey = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60);

const istH = (ms: number) => new Date(ms + IST_OFFSET);
const istHourKey = (ms: number): string => {
  const d = istH(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}`;
};
const istDateStr = (ms: number): string => istHourKey(ms).slice(0, 10);
const hourLabel = (ms: number): string => {
  const h = istH(ms).getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
};
const istClock = (ms: number): string => {
  const d = istH(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ hours: [], totalStories: 0 });

  const nowMs = Date.now();
  const cutoffMs = nowMs - 24 * HOUR_MS;
  const sinceIso = new Date(nowMs - 26 * HOUR_MS).toISOString();
  const todayIst = istDateStr(nowMs);

  let rows: Row[] = [];
  try {
    const res = await pool.query(
      `SELECT s.content, s.url, s.author, s.publisher_section, s.published_at, s.ingested_at,
              src.name AS source_name
         FROM signals s
         LEFT JOIN sources src ON src.id = s.source_id
        WHERE COALESCE(s.published_at, s.ingested_at) >= $1
        ORDER BY COALESCE(s.published_at, s.ingested_at) DESC
        LIMIT 12000`,
      [sinceIso]
    );
    rows = res.rows as Row[];
  } catch (err) {
    return Response.json(
      { hours: [], totalStories: 0, error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }

  type Story = { title: string; earliestMs: number; sources: Set<string>; url: string | null; section: string | null };
  const byKey = new Map<string, Story>();

  for (const r of rows) {
    const eff = effMs(r, nowMs);
    if (eff < cutoffMs) continue;
    const title = extractTitle(r.content ?? "");
    if (title.length < 10 || isFiller(title)) continue;
    const key = titleKey(title);
    if (!key) continue;
    const pub = canonicalPublisherKey((r.author ?? r.source_name ?? "").trim()) || (r.source_name ?? "src");

    const story = byKey.get(key);
    if (!story) {
      byKey.set(key, {
        title,
        earliestMs: eff,
        sources: new Set([pub]),
        url: r.url ?? null,
        section: r.publisher_section ?? null,
      });
    } else {
      story.sources.add(pub);
      if (eff < story.earliestMs) story.earliestMs = eff;
      if (!story.url && r.url) story.url = r.url;
    }
  }

  type OutStory = { title: string; sources: number; section: string | null; url: string | null; time: string; timeMs: number };
  const buckets = new Map<string, { sortKey: string; label: string; isToday: boolean; stories: OutStory[] }>();

  for (const s of byKey.values()) {
    const bk = istHourKey(s.earliestMs);
    let b = buckets.get(bk);
    if (!b) {
      b = { sortKey: bk, label: hourLabel(s.earliestMs), isToday: istDateStr(s.earliestMs) === todayIst, stories: [] };
      buckets.set(bk, b);
    }
    b.stories.push({
      title: s.title,
      sources: s.sources.size,
      section: s.section,
      url: s.url,
      time: istClock(s.earliestMs),
      timeMs: s.earliestMs,
    });
  }

  let total = 0;
  const hours = [...buckets.values()]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
    .map((b) => {
      b.stories.sort((x, y) => y.sources - x.sources || y.timeMs - x.timeMs);
      total += b.stories.length;
      return {
        label: b.label,
        isToday: b.isToday,
        count: b.stories.length,
        stories: b.stories.slice(0, 400).map(({ timeMs: _timeMs, ...rest }) => rest),
      };
    });

  return Response.json({ hours, totalStories: total });
}
