import { createAdminClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";
import { decodeEntities, canonicalPublisherKey, MAJOR_PUBLISHERS } from "@/lib/clustering/lexical";
import { isClusterEligible } from "@/lib/clustering/section-gate";
import type { SectionKey, SourceKey, Trend } from "@/lib/data/trends";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<SectionKey, string> = {
  city: "City",
  business: "Business",
  sports: "Sports",
  politics: "Politics",
  weather: "Weather",
  enter: "Entertainment",
  tech: "Tech",
  national: "National",
  world: "World",
};

const VALID_SECTIONS: ReadonlyArray<SectionKey> = [
  "city", "business", "sports", "politics",
  "weather", "enter", "tech", "national", "world",
];

// ─── Time-window rules (recency = the story's NEWEST article) ───
// A story with 3 distinct publishers is rarely brand-new (3 newsrooms take
// time to converge), so we bucket by how recently it was LAST covered, not
// when it first appeared.
const BREAKING_MAX_MIN = 30;       // last covered within 30 min
const BREAKING_EMERGED_MIN = 120;  // …AND the story first appeared <2 h ago
const TRENDING_MAX_MIN = 240;     // last covered 30 min – 4 h ago
const DEVELOPING_MAX_MIN = 720;   // last covered 4 – 12 h ago
const NEWS_PUBLISHER_BAR = 3;     // "3 distinct sources" = confirmed news
// Prominence: a confirmed story shows if it has >=1 major outlet OR a real
// crowd of publishers (>=4) even with none on the major list — so a
// 10-publisher tech story or genuine Hindi/regional news isn't suppressed.
// Only a 3-publisher, zero-major long-tail story is held back.
const MAJOR_BAR = 1;              // at least this many major outlets…
const HIGH_CORROBORATION = 4;     // …OR this many distinct publishers, major or not
const WATCHING_FRESH_MIN = 240;   // a 2-source story is "watchable" for 4h
const NEWSWIRE_FRESH_MIN = 180;   // single-source firehose: articles from the last 3h
const SOCIAL_FRESH_MIN = 720;     // social firehose: posts from the last 12h

// Effective publish time: some feeds post-date articles (IST stamped as UTC →
// ~5.5h in the future). For anything >15 min ahead, fall back to when we
// ingested it — a far better estimate of the real time. Module-level so both
// the trends path and the newswire path share it.
const FUTURE_SLACK_MS = 15 * 60 * 1000;
function effMs(s: { published_at: string | null; ingested_at: string | null }): number {
  const p = s.published_at ? new Date(s.published_at).getTime() : NaN;
  if (Number.isFinite(p) && p <= Date.now() + FUTURE_SLACK_MS) return p;
  const ing = s.ingested_at ? new Date(s.ingested_at).getTime() : NaN;
  return Number.isFinite(ing) ? Math.min(ing, Date.now()) : Date.now();
}

// Daily evergreen filler that gets enough Google-News publishers to clear the
// 3-source bar but isn't news: horoscopes, lottery results, daily commodity/
// fuel-rate roundups. Title-based (these leak in with a null/misc section, so
// the section gate misses them). Conservative — adjacent-word patterns only,
// so real market stories ("NSE accounts cross 26 crore") are untouched.
const FILLER_PATTERNS: RegExp[] = [
  /\b(horoscope|rashifal|zodiac|astrolog\w*|numerolog\w*|tarot|panchang)\b/i,
  /राशिफल|पंचांग|अंक\s*ज्योतिष/,
  /\blottery\b.{0,30}\b(result|today|sambad|draw|number)\b/i,
  /\b(kerala|nagaland|sikkim|dear)\s+lottery\b/i,
  /\b(gold|silver|petrol|diesel|cng)\s+(rate|price)s?\s+today\b/i,
  /आज के (भाव|रेट|दाम)|आज का (भाव|रेट|दाम)/,
];
function isFillerStory(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return false;
  return FILLER_PATTERNS.some((rx) => rx.test(t));
}

/**
 * GET /api/trends — trends from Supabase, shaped for the dashboard.
 *
 * Windows (the three editorial feeds):
 *   ?window=breaking  3+ publishers, broke (reached 3 sources) < 30 min ago.
 *   ?window=trending  3+ publishers, broke 30 min – 4 h ago.
 *   ?window=watching  exactly 2 publishers (one outlet short of the bar),
 *                     with a fresh article in the last 4 h.
 *
 * "broke_at" is when a story reached 3 distinct publishers — see the
 * clustering orchestrator. All buckets read distinct-publisher counts, not
 * raw article counts, so the 3-source rule is honest.
 */
export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ trends: [], reason: "supabase_not_configured" });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return Response.json({ trends: [], reason: "supabase_init_failed" });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get("window") ?? "trending";
  type Win = "breaking" | "trending" | "developing" | "watching" | "newswire" | "social";
  // Back-compat with the old window names.
  const alias: Record<string, Win> = {
    breaking: "breaking",
    trending: "trending",
    developing: "developing",
    watching: "watching",
    newswire: "newswire",
    social: "social",
    now: "breaking",
    active: "trending",
    today: "trending",
    watchlist: "watching",
    wire: "newswire",
  };
  const windowParam: Win = alias[requested] ?? "trending";

  // Newswire is the single-source firehose — built from raw signals, not
  // trends — so it takes a wholly separate path.
  if (windowParam === "newswire") {
    return newswireResponse(supabase);
  }
  if (windowParam === "social") {
    return socialResponse();
  }

  const baseSelect = `
      id, title, title_hi, section, desk, desk_hi, velocity_pct, velocity_window, trust_score,
      sentiment, geography, suggested_angle, suggested_angle_hi,
      story_type, story_type_hi, is_national_or_world,
      signal_count, publisher_count, last_updated, first_seen, broke_at,
      signals (
        id, author, content, published_at, ingested_at, url, metadata,
        sources (source_type, name)
      )
    `;

  const isoMinAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

  let query;
  if (
    windowParam === "breaking" ||
    windowParam === "trending" ||
    windowParam === "developing"
  ) {
    // The confirmed-news pool: 3+ publishers, touched in the last 12h. Which
    // bucket (Breaking / Trending / Developing) a story lands in is decided
    // in the JS filter below by its newest article's age + the major-outlet
    // prominence gate. (PostgREST can't MAX() over the joined signals.)
    // Limit is high enough to fetch the WHOLE live pool (was 150, which
    // silently dropped the tail of a >150-story pool).
    query = supabase
      .from("trends")
      .select(baseSelect)
      .eq("status", "active")
      .gte("publisher_count", NEWS_PUBLISHER_BAR)
      .gte("last_updated", isoMinAgo(DEVELOPING_MAX_MIN))
      .order("last_updated", { ascending: false })
      .limit(400);
  } else if (windowParam === "watching") {
    // watching — exactly 2 publishers (broke_at is null until 3 is reached).
    query = supabase
      .from("trends")
      .select(baseSelect)
      .eq("status", "active")
      .eq("publisher_count", 2)
      .gte("last_updated", isoMinAgo(WATCHING_FRESH_MIN))
      .order("last_updated", { ascending: false })
      .limit(60);
  } else {
    // social — stories carried on X / social. We pull recent active trends
    // broadly here, then keep only those with a social (twitter) signal in
    // the JS filter below (PostgREST can't filter by a nested source_type).
    // Empty until a social source is connected.
    query = supabase
      .from("trends")
      .select(baseSelect)
      .eq("status", "active")
      .gte("last_updated", isoMinAgo(WATCHING_FRESH_MIN))
      .order("last_updated", { ascending: false })
      .limit(60);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json(
      { trends: [], reason: "query_failed", error: error.message },
      { status: 500 }
    );
  }

  type SignalRow = {
    id: string;
    author: string | null;
    content: string;
    published_at: string;
    ingested_at: string | null;
    url: string | null;
    metadata: Record<string, unknown> | null;
    sources: { source_type: string; name: string } | { source_type: string; name: string }[] | null;
  };

  // effMs (effective publish time) is defined at module scope above.

  type TrendRow = {
    id: string;
    title: string;
    title_hi: string | null;
    section: string | null;
    desk: string | null;
    desk_hi: string | null;
    velocity_pct: number | null;
    velocity_window: string | null;
    trust_score: number | null;
    sentiment: string | null;
    geography: string | null;
    suggested_angle: string | null;
    suggested_angle_hi: string | null;
    story_type: string | null;
    story_type_hi: string | null;
    is_national_or_world: boolean | null;
    signal_count: number | null;
    publisher_count: number | null;
    last_updated: string | null;
    first_seen: string | null;
    broke_at: string | null;
    signals: SignalRow[] | null;
  };

  // For "watching", drop stories whose newest article is stale — PostgREST
  // can't MAX() over the joined signals, so we filter here. Breaking and
  // trending are already gated by broke_at in SQL.
  const filtered: TrendRow[] = ((data as TrendRow[] | null) ?? []).filter((row) => {
    const sigs = row.signals ?? [];
    if (sigs.length === 0) return false;
    // Keep astrology / lottery / daily-rate filler out of every confirmed feed.
    if (isFillerStory(decodeEntities(row.title))) return false;

    // Prominence gate for the confirmed-news feeds. Keep long-tail-only
    // stories out, but DON'T suppress a widely-covered story just because its
    // outlets aren't on the (English-leaning) major list — a 10-publisher tech
    // story, or genuine Hindi/regional news. Pass if there's >=1 major outlet
    // OR a real crowd (>=HIGH_CORROBORATION distinct publishers). Only a small
    // 3-publisher, zero-major long-tail story is held back.
    if (windowParam !== "watching") {
      const pubs = new Set<string>();
      const majors = new Set<string>();
      for (const s of sigs) {
        const srcRel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
        const pub = canonicalPublisherKey((s.author ?? srcRel?.name ?? "").trim());
        if (!pub) continue;
        pubs.add(pub);
        if (MAJOR_PUBLISHERS.has(pub)) majors.add(pub);
      }
      const prominent = majors.size >= MAJOR_BAR || pubs.size >= HIGH_CORROBORATION;
      if (!prominent) return false;
    }

    // Recency bucketing for the confirmed-news feeds, using two clocks per
    // story — its NEWEST article (last covered) and its OLDEST article (when
    // the story first emerged):
    //   Breaking   = emerged <90 min ago AND last covered <30 min ago
    //                (genuinely new + actively running — not a day-old saga
    //                that just got one fresh update)
    //   Trending   = anything else last covered <4 h ago
    //   Developing = last covered 4–12 h ago
    if (
      windowParam === "breaking" ||
      windowParam === "trending" ||
      windowParam === "developing"
    ) {
      let newest = 0;
      let oldest = Number.POSITIVE_INFINITY;
      for (const s of sigs) {
        const t = effMs(s);
        if (t > newest) newest = t;
        if (t < oldest) oldest = t;
      }
      const ageMin = (Date.now() - newest) / (60 * 1000);
      const emergedMin =
        oldest === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : (Date.now() - oldest) / (60 * 1000);
      const isBreaking =
        ageMin < BREAKING_MAX_MIN && emergedMin < BREAKING_EMERGED_MIN;
      if (windowParam === "breaking") return isBreaking;
      if (windowParam === "trending") return !isBreaking && ageMin < TRENDING_MAX_MIN;
      return ageMin >= TRENDING_MAX_MIN && ageMin < DEVELOPING_MAX_MIN;
    }

    // watching — a 2-source story with a fresh article in the last 4h.
    if (windowParam === "watching") {
      let newest = 0;
      for (const s of sigs) {
        const t = effMs(s);
        if (t > newest) newest = t;
      }
      const ageNewestMin = (Date.now() - newest) / (60 * 1000);
      return ageNewestMin <= WATCHING_FRESH_MIN;
    }
    return true;
  });

  // Sort every feed by the NEWEST article in each cluster (recency of
  // coverage) — the most-recently-covered story sits on top. `last_updated`
  // is only the processing time (≈ uniform within a tick), so we sort by the
  // real article timestamps here instead.
  const newestCache = new Map<string, number>();
  const newestArticleMs = (row: TrendRow): number => {
    const cached = newestCache.get(row.id);
    if (cached !== undefined) return cached;
    let n = 0;
    for (const s of row.signals ?? []) {
      const t = effMs(s);
      if (t > n) n = t;
    }
    newestCache.set(row.id, n);
    return n;
  };
  filtered.sort((a, b) => newestArticleMs(b) - newestArticleMs(a));

  const trends: Trend[] = filtered.map((row, idx) => {
    const signals = row.signals ?? [];

    const sourceTypeSet = new Set<SourceKey>();
    for (const sig of signals) {
      const srcRel = Array.isArray(sig.sources) ? sig.sources[0] : sig.sources;
      const st = srcRel?.source_type;
      if (st === "twitter") sourceTypeSet.add("x");
      else if (st === "rss") sourceTypeSet.add("rss");
      else if (st === "google_news") sourceTypeSet.add("gn");
    }

    // Newest-first (by effective time).
    const byNewest = [...signals].sort((a, b) => effMs(b) - effMs(a));

    // One card per distinct publisher (the newest from each) so the drawer
    // doesn't repeat the same outlet — or the same article arriving via
    // several of our feeds.
    const seenPub = new Set<string>();
    const distinctByPublisher: SignalRow[] = [];
    for (const s of byNewest) {
      const srcRel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
      const pub = canonicalPublisherKey((s.author ?? srcRel?.name ?? "").trim());
      if (pub && seenPub.has(pub)) continue;
      if (pub) seenPub.add(pub);
      distinctByPublisher.push(s);
    }

    const topSignals = distinctByPublisher.slice(0, 8).map((s) => {
      const srcRel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
      return {
        author: s.author ?? srcRel?.name ?? "Source",
        text: extractTitle(s.content),
        meta: timeAgoMs(effMs(s)),
        url: s.url ?? undefined,
        image: imageFromMeta(s.metadata),
      };
    });

    // Card image = the newest article in the cluster that carries one.
    const image = byNewest.map((s) => imageFromMeta(s.metadata)).find(Boolean);

    // Newest signal age (effective time) — shown on the card as "last seen".
    let newest = 0;
    for (const s of signals) {
      const t = effMs(s);
      if (t > newest) newest = t;
    }
    const lastSeenMinAgo = newest > 0
      ? Math.max(0, Math.round((Date.now() - newest) / 60000))
      : undefined;

    const rawSection = (row.section ?? "national") as string;
    const section: SectionKey = (VALID_SECTIONS as readonly string[]).includes(rawSection)
      ? (rawSection as SectionKey)
      : "national";
    const tag = row.desk ?? SECTION_LABELS[section];

    return {
      id: idx + 1,
      uid: row.id,
      section,
      tag,
      title: decodeEntities(row.title),
      title_hi: row.title_hi ? decodeEntities(row.title_hi) : undefined,
      velocityPct: Number(row.velocity_pct ?? 0),
      window: row.velocity_window ?? "—",
      // Show DISTINCT PUBLISHERS as the source count — that's the 3-source rule.
      signalCount: row.publisher_count ?? 0,
      sources: [...sourceTypeSet],
      trust: row.trust_score ?? 0,
      desk: row.desk ?? SECTION_LABELS[section],
      desk_hi: row.desk_hi ?? undefined,
      suggestedAngle: row.suggested_angle ?? "",
      suggestedAngle_hi: row.suggested_angle_hi ?? undefined,
      storyType: row.story_type ?? undefined,
      storyType_hi: row.story_type_hi ?? undefined,
      isNationalOrWorld: row.is_national_or_world ?? false,
      lastSeenMinAgo,
      image,
      topSignals,
    };
  });

  return Response.json({ trends, count: trends.length });
}

/**
 * Newswire — the single-source firehose. Most incoming articles are carried by
 * only one outlet, so they never cluster into a multi-publisher trend and would
 * otherwise be invisible (≈65% of ingested signals). Here we surface the
 * freshest of them straight from the signals table (topic_id IS NULL = not part
 * of any story), filler sections dropped, deduped by URL and by publisher+title.
 * Each card is ONE article (publisher_count = 1), explicitly uncorroborated.
 */
async function newswireResponse(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Response> {
  const sinceIso = new Date(Date.now() - NEWSWIRE_FRESH_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signals")
    .select(
      "id, content, author, published_at, ingested_at, url, metadata, publisher_section, sources(source_type, name)"
    )
    .is("topic_id", null)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(1000);

  if (error) {
    return Response.json(
      { trends: [], reason: "query_failed", error: error.message },
      { status: 500 }
    );
  }

  type NwRow = {
    id: string;
    content: string | null;
    author: string | null;
    published_at: string | null;
    ingested_at: string | null;
    url: string | null;
    metadata: Record<string, unknown> | null;
    publisher_section: string | null;
    sources:
      | { source_type: string; name: string }
      | { source_type: string; name: string }[]
      | null;
  };

  const rows = (data as NwRow[] | null) ?? [];
  const seenUrl = new Set<string>();
  const seenKey = new Set<string>();
  const perPub = new Map<string, number>(); // cap one outlet from flooding the lane
  const NEWSWIRE_PER_PUB = 4;
  const trends: Trend[] = [];

  for (const r of rows) {
    if (!isClusterEligible(r.publisher_section)) continue;
    const title = extractTitle(r.content ?? "");
    if (title.length < 12) continue;
    if (isFillerStory(title)) continue;
    if (r.url && seenUrl.has(r.url)) continue;

    const srcRel = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    const pubName = (r.author ?? srcRel?.name ?? "Source").trim();
    const pubKey = canonicalPublisherKey(pubName);
    const titleKey =
      pubKey + "|" + title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 48);
    if (seenKey.has(titleKey)) continue;
    if ((perPub.get(pubKey) ?? 0) >= NEWSWIRE_PER_PUB) continue;
    if (r.url) seenUrl.add(r.url);
    seenKey.add(titleKey);
    perPub.set(pubKey, (perPub.get(pubKey) ?? 0) + 1);

    const st = srcRel?.source_type;
    const source: SourceKey = st === "twitter" ? "x" : st === "google_news" ? "gn" : "rss";
    const tMs = effMs(r);

    trends.push({
      id: trends.length + 1,
      section: "national",
      tag: pubName || "Newswire",
      title: decodeEntities(title),
      velocityPct: 0,
      window: "—",
      signalCount: 1,
      sources: [source],
      trust: 1,
      desk: pubName || "Newswire",
      suggestedAngle: "",
      storyType: "Newswire",
      isNationalOrWorld: false,
      lastSeenMinAgo: Math.max(0, Math.round((Date.now() - tMs) / 60000)),
      image: imageFromMeta(r.metadata),
      topSignals: [
        {
          author: pubName,
          text: decodeEntities(title),
          meta: timeAgoMs(tMs),
          url: r.url ?? undefined,
          image: imageFromMeta(r.metadata),
        },
      ],
    });
    if (trends.length >= 80) break;
  }

  return Response.json({ trends, count: trends.length });
}

/**
 * Social — firehose of recent posts from connected social sources
 * (reddit / youtube / twitter). Read straight from social signals (which are
 * excluded from clustering), capped per source so one subreddit/channel can't
 * dominate. The `twitter` type is supported for when a working RSS endpoint
 * (self-hosted Nitter / scraper) is added.
 */
async function socialResponse(): Promise<Response> {
  const sinceIso = new Date(Date.now() - SOCIAL_FRESH_MIN * 60 * 1000).toISOString();
  // INNER JOIN with a filter on the joined source_type — a native query, since
  // the compat embeds are correlated subqueries that can't be filtered upward.
  let data: unknown[] = [];
  try {
    const res = await pool.query(
      `SELECT s.id, s.content, s.author, s.published_at, s.ingested_at, s.url, s.metadata,
              json_build_object('source_type', src.source_type, 'name', src.name) AS sources
         FROM signals s
         JOIN sources src ON src.id = s.source_id
        WHERE src.source_type = ANY($1) AND s.published_at >= $2
        ORDER BY s.published_at DESC
        LIMIT 400`,
      [["reddit", "youtube", "twitter"], sinceIso]
    );
    data = res.rows;
  } catch (err) {
    return Response.json(
      {
        trends: [],
        reason: "query_failed",
        error: err instanceof Error ? err.message : "query failed",
      },
      { status: 500 }
    );
  }

  type SR = {
    id: string;
    content: string | null;
    author: string | null;
    published_at: string | null;
    ingested_at: string | null;
    url: string | null;
    metadata: Record<string, unknown> | null;
    sources:
      | { source_type: string; name: string }
      | { source_type: string; name: string }[]
      | null;
  };
  const PLATFORM: Record<string, string> = {
    reddit: "Reddit",
    youtube: "YouTube",
    twitter: "X",
  };
  const rows = (data as SR[] | null) ?? [];
  const seenUrl = new Set<string>();
  const perSource = new Map<string, number>();
  const PER_SOURCE = 6;
  const trends: Trend[] = [];

  for (const r of rows) {
    const title = extractTitle(r.content ?? "");
    if (title.length < 6) continue;
    if (r.url && seenUrl.has(r.url)) continue;
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    const platform = PLATFORM[src?.source_type ?? ""] ?? "Social";
    const srcName = (src?.name ?? platform).trim();
    if ((perSource.get(srcName) ?? 0) >= PER_SOURCE) continue;
    if (r.url) seenUrl.add(r.url);
    perSource.set(srcName, (perSource.get(srcName) ?? 0) + 1);
    const tMs = effMs(r);

    trends.push({
      id: trends.length + 1,
      section: "national",
      tag: `${platform} · ${srcName}`,
      title: decodeEntities(title),
      velocityPct: 0,
      window: "—",
      signalCount: 1,
      sources: [],
      trust: 1,
      desk: platform,
      suggestedAngle: "",
      storyType: platform,
      isNationalOrWorld: false,
      lastSeenMinAgo: Math.max(0, Math.round((Date.now() - tMs) / 60000)),
      image: imageFromMeta(r.metadata),
      topSignals: [
        {
          author: srcName,
          text: decodeEntities(title),
          meta: timeAgoMs(tMs),
          url: r.url ?? undefined,
          image: imageFromMeta(r.metadata),
        },
      ],
    });
    if (trends.length >= 80) break;
  }

  return Response.json({ trends, count: trends.length });
}

function extractTitle(content: string): string {
  return decodeEntities(content.split(" — ")[0]).slice(0, 200);
}

/** Pull the image URL a signal stored in metadata.image (set at fetch from
 * the RSS feed, or during enrichment from og:image / JSON-LD). */
function imageFromMeta(meta: Record<string, unknown> | null): string | undefined {
  const img = meta?.image;
  return typeof img === "string" && img.length > 0 ? img : undefined;
}

function timeAgoMs(publishedMs: number): string {
  const ms = Date.now() - publishedMs;
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
