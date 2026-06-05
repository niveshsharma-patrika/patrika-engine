import { createAdminClient } from "@/lib/supabase/server";
import { decodeEntities } from "@/lib/clustering/lexical";
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
};

const VALID_SECTIONS: ReadonlyArray<SectionKey> = [
  "city", "business", "sports", "politics",
  "weather", "enter", "tech", "national",
];

// ─── Time-window rules (must match lib/clustering/index.ts) ──────
const BREAKING_MAX_MIN = 30;   // broke within the last 30 min
const TRENDING_MAX_MIN = 240;  // broke within the last 4 hours
const NEWS_PUBLISHER_BAR = 3;  // "3 distinct sources" = confirmed news
const WATCHING_FRESH_MIN = 240; // a 2-source story is "watchable" for 4h

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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
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
  type Win = "breaking" | "trending" | "watching" | "social";
  // Back-compat with the old window names.
  const alias: Record<string, Win> = {
    breaking: "breaking",
    trending: "trending",
    watching: "watching",
    social: "social",
    now: "breaking",
    active: "trending",
    today: "trending",
    watchlist: "watching",
  };
  const windowParam: Win = alias[requested] ?? "trending";

  const baseSelect = `
      id, title, title_hi, section, desk, desk_hi, velocity_pct, velocity_window, trust_score,
      sentiment, geography, suggested_angle, suggested_angle_hi,
      story_type, story_type_hi, is_national_or_world,
      signal_count, publisher_count, last_updated, first_seen, broke_at,
      signals (
        id, author, content, published_at, url, metadata,
        sources (source_type, name)
      )
    `;

  const isoMinAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

  let query;
  if (windowParam === "breaking") {
    query = supabase
      .from("trends")
      .select(baseSelect)
      .eq("status", "active")
      .gte("publisher_count", NEWS_PUBLISHER_BAR)
      .gte("broke_at", isoMinAgo(BREAKING_MAX_MIN))
      .order("broke_at", { ascending: false })
      .limit(40);
  } else if (windowParam === "trending") {
    // Broke between 30 min and 4 h ago — past the initial burst, still current.
    query = supabase
      .from("trends")
      .select(baseSelect)
      .eq("status", "active")
      .gte("publisher_count", NEWS_PUBLISHER_BAR)
      .gte("broke_at", isoMinAgo(TRENDING_MAX_MIN))
      .lt("broke_at", isoMinAgo(BREAKING_MAX_MIN))
      .order("publisher_count", { ascending: false })
      .order("broke_at", { ascending: false })
      .limit(80);
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
    url: string | null;
    metadata: Record<string, unknown> | null;
    sources: { source_type: string; name: string } | { source_type: string; name: string }[] | null;
  };

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
    if (windowParam === "social") {
      // Only stories that have at least one social (X/Twitter) signal.
      return sigs.some((s) => {
        const sr = Array.isArray(s.sources) ? s.sources[0] : s.sources;
        return sr?.source_type === "twitter";
      });
    }
    if (windowParam !== "watching") return true;
    let newest = 0;
    for (const s of sigs) {
      const t = new Date(s.published_at).getTime();
      if (t > newest) newest = t;
    }
    const ageNewestMin = (Date.now() - newest) / (60 * 1000);
    return ageNewestMin <= WATCHING_FRESH_MIN;
  });

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

    // Newest-first — used both for the article previews and to pick the
    // card's representative image (the first article that has one).
    const byNewest = [...signals].sort(
      (a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

    const topSignals = byNewest.slice(0, 8).map((s) => {
      const srcRel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
      return {
        author: s.author ?? srcRel?.name ?? "Source",
        text: extractTitle(s.content),
        meta: timeAgo(s.published_at),
        url: s.url ?? undefined,
        image: imageFromMeta(s.metadata),
      };
    });

    // Card image = the newest article in the cluster that carries one.
    const image = byNewest.map((s) => imageFromMeta(s.metadata)).find(Boolean);

    // Newest signal age — shown on the card as "last seen".
    let newest = 0;
    for (const s of signals) {
      const t = new Date(s.published_at).getTime();
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

function extractTitle(content: string): string {
  return decodeEntities(content.split(" — ")[0]).slice(0, 200);
}

/** Pull the image URL a signal stored in metadata.image (set at fetch from
 * the RSS feed, or during enrichment from og:image / JSON-LD). */
function imageFromMeta(meta: Record<string, unknown> | null): string | undefined {
  const img = meta?.image;
  return typeof img === "string" && img.length > 0 ? img : undefined;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
