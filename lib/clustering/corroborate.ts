import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchGoogleNews } from "@/lib/sources/google-news";
import type { RawSignal } from "@/lib/sources/rss";
import { tokenize } from "./lexical";

/**
 * Google News "Full Coverage" corroboration.
 *
 * The topic feeds give us breadth (one article per story); this gives us
 * DEPTH. For each "Watching" story (exactly 2 distinct publishers) we run a
 * Google News *search* for its headline keywords — which returns every
 * outlet covering that story (often 30-60 publishers) — and inject the
 * matching results as real signals linked to the trend. The reconcile pass
 * then recomputes publisher_count from all linked signals, so the story
 * auto-promotes Watching → Trending / Breaking if Google shows 3+ outlets.
 *
 * This means the 3-source bar reflects Google's *entire* aggregation, not
 * just the feeds we happen to have wired up.
 *
 * Guard rails: capped per tick, throttled (a story is only searched once —
 * we skip any that already carry full-coverage signals), and killable via
 * SKIP_CORROBORATE=1.
 */

const SEARCH_CAP = 25;      // max Google News searches per tick
const CONCURRENCY = 4;      // parallel searches
const LOOKBACK_MIN = 180;   // only corroborate Watching stories fresh in last 3h
const MIN_SHARED_WORDS = 2; // a search result must share >= this many title words
const FUTURE_SLACK_MS = 15 * 60 * 1000;
const FC_MARKER = "internal://google-news-full-coverage";

export type CorroborateStats = {
  candidates: number;
  searched: number;
  signals_injected: number;
  stories_boosted: number;
  duration_ms: number;
};

export async function corroborateWatching(
  supabase: SupabaseClient
): Promise<CorroborateStats> {
  const started = Date.now();
  const done = (extra: Partial<CorroborateStats> = {}): CorroborateStats => ({
    candidates: 0, searched: 0, signals_injected: 0, stories_boosted: 0,
    duration_ms: Date.now() - started, ...extra,
  });

  if (process.env.SKIP_CORROBORATE === "1") return done();

  const sourceId = await ensureFullCoverageSource(supabase);
  if (!sourceId) return done();

  // Candidate "Watching" trends: exactly 2 publishers, active, recent.
  const sinceIso = new Date(Date.now() - LOOKBACK_MIN * 60_000).toISOString();
  const { data: trendRows } = await supabase
    .from("trends")
    .select("id, title")
    .eq("status", "active")
    .eq("publisher_count", 2)
    .gte("last_updated", sinceIso)
    .order("last_updated", { ascending: false })
    .limit(80);

  const candidates = (trendRows as { id: string; title: string }[] | null) ?? [];
  if (candidates.length === 0) return done();

  // Throttle: skip any trend already carrying full-coverage signals.
  const already = new Set<string>();
  const ids = candidates.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data: ex } = await supabase
      .from("signals")
      .select("topic_id")
      .eq("source_id", sourceId)
      .in("topic_id", chunk);
    for (const r of (ex as { topic_id: string | null }[] | null) ?? []) {
      if (r.topic_id) already.add(r.topic_id);
    }
  }

  const todo = candidates.filter((t) => !already.has(t.id)).slice(0, SEARCH_CAP);
  if (todo.length === 0) return done({ candidates: candidates.length });

  let searched = 0;
  let injected = 0;
  let boosted = 0;

  await runWithConcurrency(todo, CONCURRENCY, async (trend) => {
    const query = buildQuery(trend.title);
    if (!query) return;

    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
      `&hl=en-IN&gl=IN&ceid=IN:en`;

    let results: RawSignal[];
    try {
      results = await fetchGoogleNews(url, "Google News · Full Coverage");
    } catch {
      return;
    }
    searched += 1;

    const titleWords = new Set(tokenize(trend.title));
    const nowMs = Date.now();

    const rows = results
      .filter((r) => sharedCount(titleWords, tokenize(signalTitle(r))) >= MIN_SHARED_WORDS)
      .map((r) => {
        const pubMs = new Date(r.published_at).getTime();
        const published_at =
          Number.isFinite(pubMs) && pubMs <= nowMs + FUTURE_SLACK_MS
            ? r.published_at
            : new Date(nowMs).toISOString();
        return { ...r, source_id: sourceId, topic_id: trend.id, published_at };
      });

    if (rows.length === 0) return;

    const { count, error } = await supabase
      .from("signals")
      .upsert(rows, {
        onConflict: "source_id,external_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) {
      console.warn(`[corroborate] inject failed: ${error.message}`);
      return;
    }
    injected += count ?? 0;
    if ((count ?? 0) > 0) boosted += 1;
  });

  return done({ candidates: candidates.length, searched, signals_injected: injected, stories_boosted: boosted });
}

// ─── Helpers ────────────────────────────────────────────────────

/** Find or create the dedicated source that owns full-coverage signals.
 * is_active=false so the normal fetch loop ignores it (it has no real URL). */
async function ensureFullCoverageSource(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from("sources")
    .select("id")
    .eq("url", FC_MARKER)
    .maybeSingle();
  const existing = (data as { id: string } | null)?.id;
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("sources")
    .insert({
      name: "Google News · Full Coverage",
      source_type: "google_news",
      url: FC_MARKER,
      is_active: false,
      desk: "general",
      focus: "general",
      language: "en",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.warn(`[corroborate] ensure source failed: ${error?.message ?? "no row"}`);
    return null;
  }
  return (created as { id: string }).id;
}

/** The distinctive keywords of a headline → a tight Google News query. */
function buildQuery(title: string): string {
  const words = tokenize(title).slice(0, 7);
  return words.length >= 2 ? words.join(" ") : "";
}

function signalTitle(r: RawSignal): string {
  const t = (r.metadata as { title?: unknown } | undefined)?.title;
  return typeof t === "string" && t ? t : r.content;
}

function sharedCount(a: Set<string>, b: string[]): number {
  let n = 0;
  const seen = new Set<string>();
  for (const w of b) {
    if (!seen.has(w) && a.has(w)) { n += 1; seen.add(w); }
  }
  return n;
}

async function runWithConcurrency<T>(
  items: T[],
  parallel: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item === undefined) break;
        try {
          await fn(item);
        } catch (err) {
          console.warn("[corroborate] worker error:", err instanceof Error ? err.message : err);
        }
      }
    })
  );
}
