import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { inferCategory } from "@/lib/clustering/lexical";

export const dynamic = "force-dynamic";

// News (not social) source types — Local Stories is editorial copy, not a
// reddit/X firehose.
const NEWS_TYPES = ["rss", "google_news", "sitemap_news"];
const FUTURE_SLACK_MS = 15 * 60 * 1000;

// Astrology / lottery / rate "filler" — dropped like every other feed does.
const FILLER_PATTERNS: RegExp[] = [
  /\b(horoscope|rashifal|zodiac|astrolog\w*|numerolog\w*|tarot|panchang)\b/i,
  /राशिफल|पंचांग|अंक\s*ज्योतिष/,
  /\blottery\b.{0,30}\b(result|today|sambad|draw|number)\b/i,
  /\b(kerala|nagaland|sikkim|dear)\s+lottery\b/i,
  /\b(gold|silver|petrol|diesel|cng)\s+(rate|price)s?\s+today\b/i,
  /आज के (भाव|रेट|दाम)|आज का (भाव|रेट|दाम)/,
];
function isFiller(title: string): boolean {
  return FILLER_PATTERNS.some((rx) => rx.test(title));
}

/** published_at, but fall back to ingested_at when it's implausibly future-dated. */
function effectiveMs(published: string | null, ingested: string | null, now: number): number {
  const p = published ? new Date(published).getTime() : NaN;
  if (Number.isFinite(p) && p <= now + FUTURE_SLACK_MS) return p;
  const ing = ingested ? new Date(ingested).getTime() : NaN;
  return Number.isFinite(ing) ? ing : Number.isFinite(p) ? p : now;
}

/**
 * GET /api/print/local-stories — the print desk's story list, from the ingested
 * `signals` ⋈ `sources` (news sources only).
 *   - CATEGORY (crime / politics / sports / …) is derived per story by the same
 *     keyword classifier the clusterer uses (inferCategory).
 *   - LOCATION is the source's `publisher_section` (Patrika's area/edition name).
 * Filters: source (source_id), local ("1" → regional-focus), location
 * (publisher_section), category, hours (recency), q (title search).
 */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const hoursRaw = Number(sp.get("hours"));
  const hours = [24, 48, 168].includes(hoursRaw) ? hoursRaw : 24;
  const sourceId = (sp.get("source") ?? "").trim();
  const local = sp.get("local") === "1";
  const location = (sp.get("location") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().toLowerCase();

  const where: string[] = [
    `s.published_at > now() - ($1 || ' hours')::interval`,
    `src.source_type = ANY($2)`,
  ];
  const params: unknown[] = [String(hours), NEWS_TYPES];
  if (sourceId && /^[0-9a-f-]{10,}$/i.test(sourceId)) { params.push(sourceId); where.push(`src.id = $${params.length}`); }
  if (local) where.push(`src.focus = 'regional'`);
  if (location) { params.push(location); where.push(`s.publisher_section = $${params.length}`); }

  try {
    const [list, srcFacet, locFacet] = await Promise.all([
      pool.query<{
        id: string; source_id: string; content: string; url: string; published_at: string; ingested_at: string;
        description: string | null; publisher_section: string | null; image: string | null;
        source_name: string; focus: string; desk: string | null;
      }>(
        `SELECT s.id, s.source_id, s.content, s.url, s.published_at, s.ingested_at, s.description, s.publisher_section,
                s.metadata->>'image' AS image, src.name AS source_name, src.focus, src.desk
           FROM signals s JOIN sources src ON src.id = s.source_id
          WHERE ${where.join(" AND ")}
          ORDER BY s.published_at DESC
          LIMIT 600`,
        params
      ),
      pool.query<{ id: string; name: string; focus: string }>(
        `SELECT id, name, focus FROM sources WHERE is_active AND source_type = ANY($1) ORDER BY name`,
        [NEWS_TYPES]
      ),
      pool.query<{ publisher_section: string }>(
        `SELECT DISTINCT publisher_section FROM signals
          WHERE published_at > now() - interval '7 days' AND publisher_section <> '' AND publisher_section IS NOT NULL
          ORDER BY publisher_section LIMIT 400`
      ),
    ]);

    const now = Date.now();
    type Item = {
      id: string; title: string; snippet: string; url: string; source_name: string; focus: string;
      desk: string | null; location: string; category: string; image: string | null; published_at: string;
      _ms: number; _sources: Set<string>;
    };
    const byTitle = new Map<string, Item>();
    for (const r of list.rows) {
      const title = (r.content || "").split(" — ")[0].trim() || (r.content || "").trim();
      if (title.length < 10 || isFiller(title)) continue;
      const key = title.toLowerCase().replace(/\s+/g, " ");
      if (q && !key.includes(q)) continue;
      const ms = effectiveMs(r.published_at, r.ingested_at, now);
      const existing = byTitle.get(key);
      if (existing) { existing._sources.add(r.source_id); continue; }
      const snippet = (r.description || (r.content || "").split(" — ").slice(1).join(" — ")).trim();
      byTitle.set(key, {
        id: r.id, title, snippet: snippet.slice(0, 240), url: r.url, source_name: r.source_name, focus: r.focus, desk: r.desk,
        location: r.publisher_section || "",
        category: inferCategory({
          id: r.id, title, excerpt: snippet, keywords: [], section: r.publisher_section, publisher: r.source_name,
          publishedAtMs: ms, url: r.url, sourceId: r.source_id, topicId: null, language: null, focus: r.focus,
        }),
        image: r.image || null, published_at: new Date(ms).toISOString(), _ms: ms, _sources: new Set([r.source_id]),
      });
    }

    let items = [...byTitle.values()];
    const categories = [...new Set(items.map((i) => i.category))].sort();
    if (category) items = items.filter((i) => i.category === category);
    const out = items
      .sort((a, b) => b._ms - a._ms)
      .map(({ _ms, _sources, ...rest }) => { void _ms; return { ...rest, sourceCount: _sources.size }; });

    return Response.json({
      items: out,
      sources: srcFacet.rows,
      locations: locFacet.rows.map((s) => s.publisher_section),
      categories,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}
