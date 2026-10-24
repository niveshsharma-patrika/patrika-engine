import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { inferCategory } from "@/lib/clustering/lexical";
import { detectCity } from "@/lib/geo/cities";

export const dynamic = "force-dynamic";

const NEWS_TYPES = ["rss", "google_news", "sitemap_news"];
const FUTURE_SLACK_MS = 15 * 60 * 1000;

const FILLER = [
  /\b(horoscope|rashifal|zodiac|astrolog\w*|numerolog\w*|tarot|panchang)\b/i,
  /राशिफल|पंचांग|अंक\s*ज्योतिष/,
  /\blottery\b.{0,30}\b(result|today|sambad|draw|number)\b/i,
  /\b(kerala|nagaland|sikkim|dear)\s+lottery\b/i,
  /\b(gold|silver|petrol|diesel|cng)\s+(rate|price)s?\s+today\b/i,
  /आज के (भाव|रेट|दाम)|आज का (भाव|रेट|दाम)/,
];
const isFiller = (t: string) => FILLER.some((rx) => rx.test(t));

function effMs(pub: string | null, ing: string | null, now: number): number {
  const p = pub ? new Date(pub).getTime() : NaN;
  if (Number.isFinite(p) && p <= now + FUTURE_SLACK_MS) return p;
  const i = ing ? new Date(ing).getTime() : NaN;
  return Number.isFinite(i) ? i : Number.isFinite(p) ? p : now;
}

type Story = {
  id: string; title: string; titleHi: string; snippet: string; url: string | null; image: string | null;
  city: string; category: string; source: string; scope: "national" | "local"; published_at: string; sourceCount: number;
};

/**
 * GET /api/print/stories?scope=national|local&hours=&city=&category=&q=
 *  - national = clustered trend stories (multi-publisher). Hindi via title_hi.
 *  - local    = individual stories from Hindi / bilingual sources.
 * Every story is tagged with a CITY (detectCity) and a CATEGORY (inferCategory).
 * Signed-in users only.
 */
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const scope = sp.get("scope") === "local" ? "local" : "national";
  const hoursRaw = Number(sp.get("hours"));
  const hours = [24, 48, 168].includes(hoursRaw) ? hoursRaw : 24;
  const city = (sp.get("city") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const now = Date.now();

  try {
    let all: Story[] = [];

    if (scope === "national") {
      const { rows } = await pool.query<{
        id: string; title: string; title_hi: string | null; section: string | null; geography: string | null;
        publisher_count: number; last_updated: string; image: string | null; url: string | null;
      }>(
        `SELECT t.id, t.title, t.title_hi, t.section, t.geography, t.publisher_count, t.last_updated,
                (SELECT s.metadata->>'image' FROM signals s WHERE s.topic_id = t.id AND COALESCE(s.metadata->>'image','') <> '' LIMIT 1) AS image,
                (SELECT s.url FROM signals s WHERE s.topic_id = t.id AND s.url IS NOT NULL ORDER BY s.published_at DESC LIMIT 1) AS url
           FROM trends t
          WHERE t.status = 'active' AND t.publisher_count >= 2 AND t.last_updated > now() - ($1 || ' hours')::interval
          ORDER BY t.last_updated DESC
          LIMIT 150`,
        [String(hours)]
      );
      all = rows.map((r) => {
        const title = (r.title || "").trim();
        const titleHi = (r.title_hi || "").trim();
        return {
          id: r.id, title, titleHi, snippet: "", url: r.url, image: r.image || null,
          city: detectCity(title, titleHi, r.geography),
          category: inferCategory({ id: r.id, title: `${title} ${titleHi}`, excerpt: "", keywords: [], section: r.section, publisher: "", publishedAtMs: new Date(r.last_updated).getTime(), url: r.url, sourceId: null, topicId: r.id, language: null, focus: null }),
          source: "", scope: "national" as const, published_at: r.last_updated, sourceCount: r.publisher_count ?? 0,
        };
      }).filter((s) => s.title && !isFiller(s.title));
    } else {
      const { rows } = await pool.query<{
        id: string; source_id: string; content: string; url: string; published_at: string; ingested_at: string;
        description: string | null; publisher_section: string | null; image: string | null; source_name: string; focus: string;
      }>(
        `SELECT s.id, s.source_id, s.content, s.url, s.published_at, s.ingested_at, s.description, s.publisher_section,
                s.metadata->>'image' AS image, src.name AS source_name, src.focus
           FROM signals s JOIN sources src ON src.id = s.source_id
          WHERE s.published_at > now() - ($1 || ' hours')::interval
            AND src.source_type = ANY($2) AND src.language IN ('hi','bilingual')
          ORDER BY s.published_at DESC
          LIMIT 600`,
        [String(hours), NEWS_TYPES]
      );
      const seen = new Map<string, Story>();
      for (const r of rows) {
        const title = (r.content || "").split(" — ")[0].trim() || (r.content || "").trim();
        if (title.length < 8 || isFiller(title)) continue;
        const key = title.toLowerCase().replace(/\s+/g, " ");
        const prev = seen.get(key);
        if (prev) { prev.sourceCount++; continue; }
        const snippet = (r.description || (r.content || "").split(" — ").slice(1).join(" — ")).trim();
        const ms = effMs(r.published_at, r.ingested_at, now);
        seen.set(key, {
          id: r.id, title, titleHi: title, snippet: snippet.slice(0, 220), url: r.url, image: r.image || null,
          city: detectCity(title, r.publisher_section, snippet),
          category: inferCategory({ id: r.id, title, excerpt: snippet, keywords: [], section: r.publisher_section, publisher: r.source_name, publishedAtMs: ms, url: r.url, sourceId: r.source_id, topicId: null, language: null, focus: r.focus }),
          source: r.source_name, scope: "local" as const, published_at: new Date(ms).toISOString(), sourceCount: 1,
        });
      }
      all = [...seen.values()];
    }

    // Facets from the full tagged set, before narrowing.
    const cities = [...new Set(all.map((s) => s.city).filter(Boolean))].sort();
    const categories = [...new Set(all.map((s) => s.category))].sort();

    let items = all;
    if (city) items = items.filter((s) => s.city === city);
    if (category) items = items.filter((s) => s.category === category);
    if (q) items = items.filter((s) => `${s.title} ${s.titleHi} ${s.snippet}`.toLowerCase().includes(q));
    items = items.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

    return Response.json({ items, cities, categories });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}
