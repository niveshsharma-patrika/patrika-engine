import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { inferCategory } from "@/lib/clustering/lexical";
import { getPrintCities } from "@/lib/print/cities";

export const dynamic = "force-dynamic";

const FUTURE_SLACK_MS = 15 * 60 * 1000;
const FILLER = [
  /\b(horoscope|rashifal|zodiac|astrolog\w*|numerolog\w*|tarot|panchang)\b/i,
  /राशिफल|पंचांग|अंक\s*ज्योतिष/,
  /\blottery\b.{0,30}\b(result|today|sambad|draw|number)\b/i,
  /\b(gold|silver|petrol|diesel|cng)\s+(rate|price)s?\s+today\b/i,
  /आज के (भाव|रेट|दाम)|आज का (भाव|रेट|दाम)/,
];
const isFiller = (t: string) => FILLER.some((rx) => rx.test(t));
// Rows read per request. Search runs in SQL, so it always covers the full time
// window; the cap only bounds the newest-first page (flagged as `truncated`).
const CAP_ONE_CITY = 2000;
const CAP_ALL_CITIES = 5000;

function effMs(pub: string | null, ing: string | null, now: number): number {
  const p = pub ? new Date(pub).getTime() : NaN;
  if (Number.isFinite(p) && p <= now + FUTURE_SLACK_MS) return p;
  const i = ing ? new Date(ing).getTime() : NaN;
  return Number.isFinite(i) ? i : Number.isFinite(p) ? p : now;
}

/**
 * GET /api/print/local?city=&category=&hours=&q= — local news for the print
 * desk, from the print desk's OWN per-city sources (sources.scope='print').
 * The city comes from the source itself (reliable), category from the shared
 * classifier. Stories carried by several publications are merged with a count.
 */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const city = (sp.get("city") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const hoursRaw = Number(sp.get("hours"));
  const hours = [24, 48, 168].includes(hoursRaw) ? hoursRaw : 48;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const now = Date.now();

  try {
    const cities = await getPrintCities();
    const cityByKey = Object.fromEntries(cities.map((c) => [c.key, c]));

    // Only ACTIVE cities (a switched-off city's old stories drop out too).
    const where = [`s.published_at > now() - ($1 || ' hours')::interval`, `src.scope = 'print'`, `pc.active`];
    const params: unknown[] = [String(hours)];
    if (city) { params.push(city); where.push(`src.city = $${params.length}`); }
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
      where.push(`(s.content ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }
    const cap = city ? CAP_ONE_CITY : CAP_ALL_CITIES;

    const { rows } = await pool.query<{
      id: string; content: string; url: string; author: string | null; published_at: string; ingested_at: string;
      description: string | null; publisher_section: string | null; image: string | null;
      source_name: string; city: string | null; focus: string | null;
    }>(
      `SELECT s.id, s.content, s.url, s.author, s.published_at, s.ingested_at, s.description, s.publisher_section,
              s.metadata->>'image' AS image, src.name AS source_name, src.city, src.focus
         FROM signals s
         JOIN sources src ON src.id = s.source_id
         JOIN print_cities pc ON pc.key = src.city
        WHERE ${where.join(" AND ")}
        ORDER BY s.published_at DESC
        LIMIT ${cap}`,
      params
    );
    const truncated = rows.length >= cap;

    type Item = {
      id: string; title: string; snippet: string; url: string; image: string | null; city: string; cityName: string; cityNameHi: string;
      category: string; publishers: string[]; sourceCount: number; published_at: string; _ms: number; _pubs: Set<string>;
    };
    const seen = new Map<string, Item>();
    for (const r of rows) {
      const title = (r.content || "").split(" — ")[0].trim() || (r.content || "").trim();
      if (title.length < 8 || isFiller(title)) continue;
      const key = title.toLowerCase().replace(/\s+/g, " ");
      const publisher = (r.author || r.source_name || "").trim();
      const prev = seen.get(key);
      if (prev) { if (publisher) prev._pubs.add(publisher); continue; }
      const snippet = (r.description || (r.content || "").split(" — ").slice(1).join(" — ")).trim();
      const ms = effMs(r.published_at, r.ingested_at, now);
      const c = r.city ? cityByKey[r.city] : undefined;
      seen.set(key, {
        id: r.id, title, snippet: snippet.slice(0, 220), url: r.url, image: r.image || null,
        city: r.city ?? "", cityName: c?.name_en ?? r.city ?? "", cityNameHi: c?.name_hi ?? r.city ?? "",
        category: inferCategory({ id: r.id, title, excerpt: snippet, keywords: [], section: r.publisher_section, publisher, publishedAtMs: ms, url: r.url, sourceId: null, topicId: null, language: null, focus: r.focus }),
        publishers: [], sourceCount: 0, published_at: new Date(ms).toISOString(), _ms: ms, _pubs: new Set(publisher ? [publisher] : []),
      });
    }

    let all = [...seen.values()];
    const categories = [...new Set(all.map((i) => i.category))].sort();
    if (category) all = all.filter((i) => i.category === category);
    const items = all
      .sort((a, b) => b._ms - a._ms)
      .map(({ _ms, _pubs, ...rest }) => { void _ms; return { ...rest, publishers: [..._pubs].slice(0, 6), sourceCount: Math.max(1, _pubs.size) }; });

    return Response.json({ items, truncated, cities: cities.map((c) => ({ key: c.key, name_en: c.name_en, name_hi: c.name_hi, region: c.region })), categories });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}
