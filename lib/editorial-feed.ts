/**
 * Editorial review feed (editorialreview.patrika.com) — read-only viewer source.
 *
 * The upstream returns { statusCode, status, data: { "<n>": item, ... } } for a
 * given date, paginated by `start` (note the param is spelled `lmit`). One call
 * caps at ~1000 items, a day can hold a few thousand, so we loop until a page
 * adds nothing new, de-duping by id. Responses are cached per-date in-process.
 *
 * This feed is NOT wired to anything — it only powers the standalone viewer at
 * /editorial-feed (list + detail + filters).
 */

const FEED_BASE = "https://editorialreview.patrika.com/feed.html";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 25; // backstop against a server that ignores `start`
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_DATES = 16; // bound the in-process cache (one entry ≈ a few MB)

/** One item exactly as the upstream sends it (fields we rely on). */
export type FeedItemRaw = {
  id?: string;
  zimbea_id?: string;
  story_type?: string | null;
  author?: string | null;
  branch?: string | null;
  desk?: string | null;
  heading?: string | null;
  keyword?: string | null;
  img?: string | null;
  description?: string | null;
  pubDate?: string | null;
};

/** Normalised item for the list (no heavy body). */
export type FeedListItem = {
  id: string;
  heading: string;
  img: string;
  desk: string;
  storyType: string;
  author: string;
  pubDate: string;
};

/** Normalised item for the detail page (adds the body + keywords). */
export type FeedDetailItem = FeedListItem & {
  description: string;
  keyword: string;
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Cached = { at: number; items: FeedItemRaw[] };
const CACHE = new Map<string, Cached>();

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Route an upstream (often http-only) image through our same-origin proxy so
 *  it loads on an https page without mixed-content blocking. */
export function proxiedImg(url: string): string {
  const u = s(url);
  if (!u) return "";
  return `/api/editorial-feed/image?u=${encodeURIComponent(u)}`;
}

async function fetchPage(date: string, start: number): Promise<FeedItemRaw[]> {
  const url = `${FEED_BASE}?date=${encodeURIComponent(date)}&start=${start}&lmit=${PAGE_LIMIT}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Editorial feed upstream returned ${res.status}`);
  const json = (await res.json()) as { data?: unknown } | null;
  const data = json?.data;
  if (!data || typeof data !== "object") return [];
  return Object.values(data as Record<string, FeedItemRaw>);
}

/** All raw items for a date, paginated + de-duped, cached in-process. */
export async function fetchFeedForDate(date: string): Promise<FeedItemRaw[]> {
  if (!DATE_RE.test(date)) throw new Error("Invalid date (expected YYYY-MM-DD)");

  const hit = CACHE.get(date);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const byId = new Map<string, FeedItemRaw>();
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchPage(date, start);
    if (batch.length === 0) break;
    const before = byId.size;
    for (const it of batch) {
      const id = s(it?.id);
      if (id && !byId.has(id)) byId.set(id, it);
    }
    start += batch.length;
    if (byId.size === before) break; // page added nothing new → done
  }

  const items = [...byId.values()];

  // Bound the cache: drop expired entries, then evict oldest over the cap.
  const now = Date.now();
  for (const [k, v] of CACHE) if (now - v.at >= CACHE_TTL_MS) CACHE.delete(k);
  while (CACHE.size >= CACHE_MAX_DATES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  CACHE.set(date, { at: now, items });
  return items;
}

function toListItem(it: FeedItemRaw): FeedListItem {
  return {
    id: s(it.id),
    heading: s(it.heading),
    img: proxiedImg(s(it.img)),
    desk: s(it.desk),
    storyType: s(it.story_type),
    author: s(it.author),
    pubDate: s(it.pubDate),
  };
}

/** List payload for the viewer: light items (newest first) + filter facets. */
export async function getFeedList(date: string): Promise<{
  date: string;
  count: number;
  items: FeedListItem[];
  desks: string[];
  storyTypes: string[];
}> {
  const raw = await fetchFeedForDate(date);
  const items = raw.map(toListItem).filter((i) => i.id);

  // Newest first; items with a missing/unparseable pubDate sort to the bottom.
  // (Mapping NaN → -Infinity keeps this a total order — returning 0 for NaN
  // would be non-transitive and could mis-order the valid items too.)
  items.sort((a, b) => {
    const ta = Date.parse(a.pubDate);
    const tb = Date.parse(b.pubDate);
    const na = Number.isNaN(ta) ? -Infinity : ta;
    const nb = Number.isNaN(tb) ? -Infinity : tb;
    return nb - na;
  });

  const desks = [...new Set(items.map((i) => i.desk).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const storyTypes = [...new Set(items.map((i) => i.storyType).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  return { date, count: items.length, items, desks, storyTypes };
}

/** Full single item for the detail page, or null if the id isn't in that date. */
export async function getFeedItem(date: string, id: string): Promise<FeedDetailItem | null> {
  const wanted = s(id);
  if (!wanted) return null;
  const raw = await fetchFeedForDate(date);
  const it = raw.find((r) => s(r.id) === wanted);
  if (!it) return null;
  return {
    ...toListItem(it),
    description: s(it.description),
    keyword: s(it.keyword),
  };
}
