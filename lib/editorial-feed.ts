/**
 * Editorial review feed (editorialreview.patrika.com) — read-only viewer source.
 *
 * The upstream returns { statusCode, status, data: { "<n>": item, ... } } for a
 * given date, paginated by `start` (note the param is spelled `lmit`). One call
 * caps at ~1000 items and a day can hold a few thousand.
 *
 * The viewer paginates: it asks for ONE page at a time (getFeedPage) for a fast
 * first paint, then the client walks `nextStart` to stream the rest. Pages are
 * cached in-process (bounded) so re-walks, the detail lookup, and repeat visits
 * are cheap. NOT wired to anything else.
 */

const FEED_BASE = "https://editorialreview.patrika.com/feed.html";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 25; // backstop against a server that ignores `start`
const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_CACHE_MAX = 48; // ≈ a handful of full days of pages

// Curation thresholds (deterministic, no AI). Tune these in one place.
const MIN_BODY = 250; // shorter cleaned bodies are "too short"
const CAPTION_BODY = 400; // layout-caption headings need at least this much body
const ONELINER_DELTA = 20; // body barely longer than heading = just the headline
const GARBAGE_RATIO = 0.35; // symbol-heavy bodies are "low text"

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

/** Curation bucket: a cleaned, meaty story vs a thin/garbage leave-out. */
export type FeedStatus = "finalized" | "left_out";

/** Normalised item for the list (no heavy body). Heading is cleaned; `status`
 *  + `reason` are the deterministic curation verdict. */
export type FeedListItem = {
  id: string;
  heading: string;
  img: string;
  desk: string;
  storyType: string;
  author: string;
  pubDate: string;
  status: FeedStatus;
  reason: string; // why it was left out ("" when finalized)
};

/** Normalised item for the detail page (adds the cleaned body + keywords). */
export type FeedDetailItem = FeedListItem & {
  description: string;
  keyword: string;
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type CachedPage = { at: number; raw: FeedItemRaw[] };
const PAGE_CACHE = new Map<string, CachedPage>();

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

/** One raw upstream page, cached in-process (bounded + TTL). */
async function fetchPageCached(date: string, start: number): Promise<FeedItemRaw[]> {
  const key = `${date}:${start}`;
  const hit = PAGE_CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.raw;

  const raw = await fetchPage(date, start);

  // Bound the cache: drop expired entries, then evict oldest over the cap.
  const now = Date.now();
  for (const [k, v] of PAGE_CACHE) if (now - v.at >= CACHE_TTL_MS) PAGE_CACHE.delete(k);
  while (PAGE_CACHE.size >= PAGE_CACHE_MAX) {
    const oldest = PAGE_CACHE.keys().next().value;
    if (oldest === undefined) break;
    PAGE_CACHE.delete(oldest);
  }
  PAGE_CACHE.set(key, { at: now, raw });
  return raw;
}

/** Leading newsroom layout tags on a heading (फोटो/बॉटम/लीड/बॉक्स…), possibly
 *  repeated and followed by dash/colon/dot runs. Stripped from the heading; the
 *  fact that one was present is a signal for the caption rule. */
const LAYOUT_PREFIX = /^\s*(?:फोटो|फ़ोटो|बॉटम|बाॅटम|बोटम्?|लीड|बॉक्स|बाक्स|photo|lead|box|bottom)\s*[-—–.:|]+\s*/i;

/** Strip editorial-system artifacts and normalise whitespace in body text. */
function cleanText(raw: string): string {
  return s(raw)
    .replace(/<\/?[a-zA-Z]{1,8}>/g, "") // <bha> … </bha> and similar short markers
    .replace(/\\B/g, "") // RTF bold toggles (literal backslash-B)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // control chars (keep \t \n)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Clean a heading to a single line and strip layout prefixes. */
function cleanHeading(raw: string): { heading: string; hadPrefix: boolean } {
  let h = cleanText(raw).replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  let hadPrefix = false;
  for (let i = 0; i < 3 && LAYOUT_PREFIX.test(h); i++) {
    h = h.replace(LAYOUT_PREFIX, "").trim();
    hadPrefix = true;
  }
  h = h.replace(/^[-—–.·:|]+\s*/, "").trim(); // leftover punctuation run
  return { heading: h, hadPrefix };
}

/** Deterministic curation verdict for a cleaned heading + body. */
function classify(heading: string, body: string, hadPrefix: boolean): { status: FeedStatus; reason: string } {
  if (!body) return { status: "left_out", reason: "no body" };
  if (body.length <= heading.length + ONELINER_DELTA) return { status: "left_out", reason: "one-liner / caption" };
  if (hadPrefix && body.length < CAPTION_BODY) return { status: "left_out", reason: "photo / caption" };
  if (body.length < MIN_BODY) return { status: "left_out", reason: "too short" };
  const junk = (body.match(/[^\p{L}\p{N}\s।,.?!:;'"()\-\n]/gu) || []).length;
  if (junk / body.length > GARBAGE_RATIO) return { status: "left_out", reason: "low text" };
  if (!/[।.?!]/.test(body)) return { status: "left_out", reason: "fragment" };
  return { status: "finalized", reason: "" };
}

/** Full cleaned + classified item. */
function normalize(it: FeedItemRaw): FeedDetailItem {
  const { heading, hadPrefix } = cleanHeading(s(it.heading));
  const description = cleanText(s(it.description));
  const { status, reason } = classify(heading, description, hadPrefix);
  return {
    id: s(it.id),
    heading,
    img: proxiedImg(s(it.img)),
    desk: s(it.desk),
    storyType: s(it.story_type),
    author: s(it.author),
    pubDate: s(it.pubDate),
    status,
    reason,
    description,
    keyword: s(it.keyword),
  };
}

function toListItem(it: FeedItemRaw): FeedListItem {
  const { description: _d, keyword: _k, ...rest } = normalize(it);
  void _d; void _k;
  return rest;
}

/** One page of light list items (upstream order) plus the cursor for the next
 *  page. `nextStart` is null once the feed is exhausted. The client de-dupes,
 *  sorts, and builds facets across pages. */
export async function getFeedPage(
  date: string,
  start: number
): Promise<{ date: string; start: number; items: FeedListItem[]; nextStart: number | null }> {
  if (!DATE_RE.test(date)) throw new Error("Invalid date (expected YYYY-MM-DD)");
  const begin = Number.isInteger(start) && start >= 0 ? start : 0;
  const raw = await fetchPageCached(date, begin);
  const items = raw.map(toListItem).filter((i) => i.id);
  const nextStart = raw.length > 0 ? begin + raw.length : null;
  return { date, start: begin, items, nextStart };
}

/** Walk every page for a date (de-duped), used only by the detail fallback. */
async function fetchAllRaw(date: string): Promise<FeedItemRaw[]> {
  const byId = new Map<string, FeedItemRaw>();
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchPageCached(date, start);
    if (batch.length === 0) break;
    const before = byId.size;
    for (const it of batch) {
      const id = s(it?.id);
      if (id && !byId.has(id)) byId.set(id, it);
    }
    start += batch.length;
    if (byId.size === before) break; // page added nothing new → done
  }
  return [...byId.values()];
}

/** Full single item for the detail page. `startHint` (the page the list loaded
 *  it from) is tried first so a normal click fetches exactly one cached page;
 *  otherwise we fall back to walking the day. Null if the id isn't found. */
export async function getFeedItem(
  date: string,
  id: string,
  startHint?: number
): Promise<FeedDetailItem | null> {
  if (!DATE_RE.test(date)) throw new Error("Invalid date (expected YYYY-MM-DD)");
  const wanted = s(id);
  if (!wanted) return null;

  if (startHint !== undefined && Number.isInteger(startHint) && startHint >= 0) {
    const page = await fetchPageCached(date, startHint);
    const hit = page.find((r) => s(r.id) === wanted);
    if (hit) return normalize(hit);
  }

  const all = await fetchAllRaw(date);
  const it = all.find((r) => s(r.id) === wanted);
  return it ? normalize(it) : null;
}
