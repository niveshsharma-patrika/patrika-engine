import type { DbClient as SupabaseClient } from "@/lib/db/compat";

import {
  makeLexicalDoc,
  clusterDocs,
  distinctPublishers,
  clusterCategory,
  chooseHeadline,
  coverageSuggestion,
  sectionForCategory,
  canonicalPublisherKey,
  type LexicalDoc,
  type SignalInput,
} from "./lexical";
import { isClusterEligible } from "./section-gate";
import { corroborateWatching, type CorroborateStats } from "./corroborate";
import { classifyStorySections } from "@/lib/ai/categorize";
import { getPipelineSettings, type PipelineSettings } from "@/lib/pipeline-settings";

/**
 * No-AI clustering + trend orchestrator.
 *
 * Every ingest tick:
 *   1. Load signals published in the last LOAD_HOURS (with publisher name).
 *   2. Featurise + lexically cluster them (./lexical — no embeddings, no LLM).
 *   3. For every cluster with >= MIN_TRACK_PUBLISHERS distinct outlets:
 *        - find the existing trend its members already belong to and REUSE
 *          it (preserving the story's identity + when it broke), or
 *        - CREATE a fresh trend.
 *      `broke_at` is stamped the moment a story reaches 3 distinct
 *      publishers — that's the clock the Breaking/Trending buckets read.
 *   4. Reconcile counts and archive trends that lost all their signals.
 *
 * Stable identity is what makes the time-windows meaningful: a story keeps
 * the same row (and the same broke_at) as it grows across ticks, so its age
 * is tracked correctly instead of resetting every run.
 */

// How far back to pull signals for clustering. Trending tops out at 4h, but
// a 4h-old story's earliest articles need to be in the pool to keep the
// cluster whole, so we load a little extra.
const LOAD_HOURS = 6;

// Clusters below this many distinct publishers aren't worth a trend row.
// 2 = "Watching" (one outlet away from the bar); 3+ = real news.
const MIN_TRACK_PUBLISHERS = 2;

// The 3-source bar: a story is "confirmed news" at this many publishers.
const NEWS_PUBLISHER_BAR = 3;

// Age thresholds (minutes) the buckets are derived from — kept here so the
// orchestrator and the API agree on what "breaking" means.
export const BREAKING_MAX_MIN = 30;
export const TRENDING_MAX_MIN = 240; // 4 hours

const WRITE_CONCURRENCY = 8;
const MAX_CLUSTERS_PER_TICK = 400;

// DB hygiene — stop the active-trend set + signals table growing unbounded
// (otherwise reconcile re-scans tens of thousands of rows every tick → IOwait).
const ARCHIVE_AFTER_HOURS = 24;    // active trends not touched this long → archived;
                                   // also the window reconcile limits itself to.
const SIGNAL_RETENTION_DAYS = 10;  // delete signals older than this.
const SIGNAL_PURGE_BATCH = 500;    // max signals purged per tick — keeps the DELETE
                                   // well under the statement timeout; any backlog
                                   // drains over subsequent ticks (oldest first).

export type ClusterStats = {
  signals_loaded: number;
  clusters_total: number;
  clusters_tracked: number;
  trends_reused: number;
  trends_created: number;
  signals_linked: number;
  trends_reconciled: number;
  trends_archived: number;
  trends_archived_stale?: number;
  signals_purged?: number;
  trends_categorized?: number;
  corroboration?: CorroborateStats;
  duration_ms: number;
};

export async function clusterAndTrend(
  supabase: SupabaseClient,
  pipeline?: PipelineSettings
): Promise<ClusterStats> {
  const started = Date.now();
  const settings = pipeline ?? (await getPipelineSettings(supabase));

  const empty = (): ClusterStats => ({
    signals_loaded: 0,
    clusters_total: 0,
    clusters_tracked: 0,
    trends_reused: 0,
    trends_created: 0,
    signals_linked: 0,
    trends_reconciled: 0,
    trends_archived: 0,
    duration_ms: Date.now() - started,
  });

  if (!settings.cluster) return empty();

  // 1. Load + featurise.
  const nowMs = Date.now();
  const inputs = await loadRecentSignals(supabase, nowMs - LOAD_HOURS * 60 * 60 * 1000);
  const docs: LexicalDoc[] = [];
  for (const input of inputs) {
    const doc = makeLexicalDoc(input, nowMs);
    if (doc) docs.push(doc);
  }

  // 2. Cluster.
  const clusters = clusterDocs(docs);

  // 3. Keep only clusters with enough distinct outlets, biggest first.
  const tracked = clusters
    .map((c) => ({ cluster: c, pubs: distinctPublishers(c) }))
    .filter((c) => c.pubs.length >= MIN_TRACK_PUBLISHERS)
    .sort((a, b) => b.pubs.length - a.pubs.length || b.cluster.length - a.cluster.length)
    .slice(0, MAX_CLUSTERS_PER_TICK);

  let trendsReused = 0;
  let trendsCreated = 0;
  let signalsLinked = 0;

  await runWithConcurrency(tracked, WRITE_CONCURRENCY, async ({ cluster, pubs }) => {
    const existingId = majorityTopicId(cluster);
    if (existingId) {
      const linked = await reuseTrend(supabase, existingId, cluster, pubs, nowMs);
      if (linked >= 0) {
        trendsReused += 1;
        signalsLinked += linked;
      }
    } else {
      const linked = await createTrend(supabase, cluster, pubs, nowMs);
      if (linked >= 0) {
        trendsCreated += 1;
        signalsLinked += linked;
      }
    }
  });

  // 4. Corroborate Watching stories via Google News Full Coverage — inject
  //    same-story articles so a 2-publisher story can cross the 3-source bar.
  const corroboration = await corroborateWatching(supabase);

  // 5. DB hygiene — archive trends gone quiet + purge old signals so the active
  //    set and signals table stay bounded (keeps reconcile + the board fast).
  const trendsArchivedStale = await archiveStaleTrends(supabase);
  const signalsPurged = await purgeOldSignals(supabase);

  // 6. Reconcile — recomputes publisher_count (incl. the injected publishers),
  //    which auto-promotes corroborated stories. Now scoped to recent trends.
  const recon = await reconcileTrendCounts(supabase);

  // 7. AI-categorise newly-seen stories (graceful — skipped without an AI key
  //    or before migration 0027; once classified a story keeps its section).
  let trendsCategorized = 0;
  try {
    trendsCategorized = (await categorizeTrends(supabase)).categorized;
  } catch (err) {
    console.warn(
      "[cluster] categorize skipped:",
      err instanceof Error ? err.message : err
    );
  }

  return {
    signals_loaded: inputs.length,
    clusters_total: clusters.length,
    clusters_tracked: tracked.length,
    trends_reused: trendsReused,
    trends_created: trendsCreated,
    signals_linked: signalsLinked,
    trends_reconciled: recon.reconciled,
    trends_archived: recon.archived,
    trends_archived_stale: trendsArchivedStale,
    signals_purged: signalsPurged,
    trends_categorized: trendsCategorized,
    corroboration,
    duration_ms: Date.now() - started,
  };
}

// ─── Load signals ───────────────────────────────────────────────

type SignalRow = {
  id: string;
  content: string | null;
  description: string | null;
  keywords: string[] | null;
  publisher_section: string | null;
  published_at: string;
  author: string | null;
  source_id: string | null;
  topic_id: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
  sources:
    | { name: string; language: string | null; desk: string | null; source_type: string | null }
    | { name: string; language: string | null; desk: string | null; source_type: string | null }[]
    | null;
};

// Social signals (reddit/youtube/twitter) feed only the Social firehose tab —
// they are NEVER clustered, so they can't count as a news "publisher".
const SOCIAL_SOURCE_TYPES = new Set(["reddit", "youtube", "twitter"]);

async function loadRecentSignals(
  supabase: SupabaseClient,
  sinceMs: number
): Promise<SignalInput[]> {
  const sinceIso = new Date(sinceMs).toISOString();
  const PAGE = 1000;
  const out: SignalInput[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("signals")
      .select(
        "id, content, description, keywords, publisher_section, published_at, author, source_id, topic_id, url, metadata, sources(name, language, desk, source_type)"
      )
      .gte("published_at", sinceIso)
      .order("published_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`cluster: load signals failed: ${error.message}`);
    const rows = (data ?? []) as SignalRow[];
    if (rows.length === 0) break;

    for (const r of rows) {
      if (!isClusterEligible(r.publisher_section)) continue;
      const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
      // Social signals (reddit/youtube/twitter) feed only the Social firehose,
      // never the news clusters — skip them here.
      if (src?.source_type && SOCIAL_SOURCE_TYPES.has(src.source_type)) continue;
      // The real publisher is the article's author (the <source> name for
      // Google News, the feed/sitemap publisher otherwise) — NOT our feed
      // name, which would treat "Google News · Business" as one publisher.
      const publisher = (r.author ?? "").trim() || src?.name || "";
      if (!publisher) continue;

      const meta = r.metadata ?? {};
      const metaTitle = typeof meta.title === "string" ? meta.title : "";
      const metaSnippet = typeof meta.snippet === "string" ? meta.snippet : "";
      const content = (r.content ?? "").trim();
      const title = metaTitle || content.split(" — ")[0] || content;
      const excerpt = r.description || metaSnippet || content.split(" — ").slice(1).join(" — ");

      out.push({
        id: r.id,
        title,
        excerpt,
        keywords: r.keywords ?? [],
        section: r.publisher_section,
        publisher,
        publishedAtMs: new Date(r.published_at).getTime(),
        url: r.url,
        sourceId: r.source_id,
        topicId: r.topic_id,
        language: src?.language ?? null,
        focus: src?.desk ?? null, // category hint lives in sources.desk
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// ─── Identity + age helpers ─────────────────────────────────────

/** The existing trend this cluster continues, if any. We pick the most
 * common non-null topic_id among members — so a story keeps its row even
 * when many fresh (unlinked) articles join in one tick. */
function majorityTopicId(cluster: LexicalDoc[]): string | null {
  const counts = new Map<string, number>();
  for (const d of cluster) {
    if (!d.topicId) continue;
    counts.set(d.topicId, (counts.get(d.topicId) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) if (n > bestN) { bestN = n; best = id; }
  return best;
}

/** The publish time at which the cluster reached NEWS_PUBLISHER_BAR distinct
 * publishers — i.e. when it became confirmed news. null if it never did. */
function brokeAtMs(cluster: LexicalDoc[]): number | null {
  const sorted = [...cluster].sort((a, b) => a.timeMs - b.timeMs);
  const seen = new Set<string>();
  for (const d of sorted) {
    seen.add(d.publisherKey);
    if (seen.size >= NEWS_PUBLISHER_BAR) return d.timeMs;
  }
  return null;
}

function earliestMs(cluster: LexicalDoc[]): number {
  return Math.min(...cluster.map((d) => d.timeMs));
}

function languagesIn(cluster: LexicalDoc[]): Set<string> {
  const set = new Set<string>();
  for (const d of cluster) if (d.language) set.add(d.language);
  return set;
}

/**
 * Trust 0-5 from distinct-publisher count + bilingual coverage.
 *   1 single outlet · 2 = 2-3 · 3 = 4-6 · 4 = 7-10 · 5 = 11+
 * A story carried in BOTH English and Hindi gets +1 (strong "real news"
 * signal), capped at 5.
 */
function computeTrust(publisherCount: number, languages: Set<string>): number {
  let t = 0;
  if (publisherCount >= 1) t = 1;
  if (publisherCount >= 2) t = 2;
  if (publisherCount >= 4) t = 3;
  if (publisherCount >= 7) t = 4;
  if (publisherCount >= 11) t = 5;
  if (languages.has("en") && languages.has("hi") && t < 5) t += 1;
  return Math.min(5, t);
}

function storyTypeForBrokeAt(brokeMs: number | null, nowMs: number): string | null {
  if (brokeMs == null) return null;
  const ageMin = (nowMs - brokeMs) / 60000;
  if (ageMin <= BREAKING_MAX_MIN) return "Breaking";
  if (ageMin <= TRENDING_MAX_MIN) return "Trending";
  return "Developing";
}

/** Simple momentum: articles in the last hour vs the hour before. */
function velocity(cluster: LexicalDoc[], nowMs: number): { pct: number; window: string } {
  const hour = 60 * 60 * 1000;
  let recent = 0;
  let prev = 0;
  for (const d of cluster) {
    const age = nowMs - d.timeMs;
    if (age <= hour) recent += 1;
    else if (age <= 2 * hour) prev += 1;
  }
  const pct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : recent > 0 ? 100 : 0;
  return { pct, window: "1h" };
}

function titleCase(value: string): string {
  return String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Persist ────────────────────────────────────────────────────

type TrendWrite = {
  title: string;
  desk: string;
  section: string;
  story_type: string | null;
  suggested_angle: string;
  signal_count: number;
  publisher_count: number;
  trust_score: number;
  velocity_pct: number;
  velocity_window: string;
  is_national_or_world: boolean;
  primary_lang: string;
  status: "active";
  last_updated: string;
};

function buildTrendWrite(cluster: LexicalDoc[], pubs: string[], nowMs: number): TrendWrite {
  const category = clusterCategory(cluster);
  const head = chooseHeadline(cluster);
  const broke = brokeAtMs(cluster);
  const vel = velocity(cluster, nowMs);
  return {
    title: head.title,
    desk: titleCase(category),
    section: sectionForCategory(category),
    story_type: storyTypeForBrokeAt(broke, nowMs),
    suggested_angle: coverageSuggestion(pubs.length, cluster.length, category),
    signal_count: cluster.length,
    publisher_count: pubs.length,
    trust_score: computeTrust(pubs.length, languagesIn(cluster)),
    velocity_pct: vel.pct,
    velocity_window: vel.window,
    is_national_or_world: category === "national" || category === "world",
    primary_lang: head.language === "hi" ? "hi" : "en",
    status: "active",
    last_updated: new Date(nowMs).toISOString(),
  };
}

async function linkSignals(
  supabase: SupabaseClient,
  trendId: string,
  cluster: LexicalDoc[]
): Promise<number> {
  const orphans = cluster.filter((d) => d.topicId !== trendId).map((d) => d.id);
  if (orphans.length === 0) return 0;
  // Chunk to stay under URL length limits on the .in() filter.
  for (let i = 0; i < orphans.length; i += 200) {
    const chunk = orphans.slice(i, i + 200);
    const { error } = await supabase
      .from("signals")
      .update({ topic_id: trendId })
      .in("id", chunk);
    if (error) {
      console.warn(`[cluster] link signals failed: ${error.message}`);
      return -1;
    }
  }
  return orphans.length;
}

async function reuseTrend(
  supabase: SupabaseClient,
  trendId: string,
  cluster: LexicalDoc[],
  pubs: string[],
  nowMs: number
): Promise<number> {
  const write = buildTrendWrite(cluster, pubs, nowMs);

  // Stamp broke_at the first time this story reaches the 3-publisher bar.
  const { data: existing } = await supabase
    .from("trends")
    .select("broke_at")
    .eq("id", trendId)
    .single();
  const prevBrokeAt = (existing as { broke_at: string | null } | null)?.broke_at ?? null;

  const patch: Record<string, unknown> = { ...write };
  // Section + desk are owned by the AI categoriser (createTrend seeds a lexical
  // guess; categorizeTrends finalises it). Don't let reuse overwrite the
  // AI-chosen category with the lexical one on every tick.
  delete patch.section;
  delete patch.desk;
  if (!prevBrokeAt && pubs.length >= NEWS_PUBLISHER_BAR) {
    const broke = brokeAtMs(cluster);
    patch.broke_at = new Date(broke ?? nowMs).toISOString();
  }

  const { error } = await supabase.from("trends").update(patch).eq("id", trendId);
  if (error) {
    console.warn(`[cluster] reuseTrend update failed: ${error.message}`);
    return -1;
  }
  return linkSignals(supabase, trendId, cluster);
}

async function createTrend(
  supabase: SupabaseClient,
  cluster: LexicalDoc[],
  pubs: string[],
  nowMs: number
): Promise<number> {
  const write = buildTrendWrite(cluster, pubs, nowMs);
  const broke = pubs.length >= NEWS_PUBLISHER_BAR ? brokeAtMs(cluster) : null;

  const { data, error } = await supabase
    .from("trends")
    .insert({
      ...write,
      first_seen: new Date(earliestMs(cluster)).toISOString(),
      broke_at: broke != null ? new Date(broke).toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn(`[cluster] createTrend insert failed: ${error?.message ?? "no row"}`);
    return -1;
  }
  return linkSignals(supabase, (data as { id: string }).id, cluster);
}

// ─── Reconcile ──────────────────────────────────────────────────

type SigJoin = {
  source_id: string | null;
  published_at: string | null;
  author: string | null;
  sources: { name: string; language: string | null } | { name: string; language: string | null }[] | null;
};

/** The real publisher of a signal: its author (the <source> for Google News,
 * the feed/sitemap publisher otherwise), falling back to the feed name. */
function publisherOf(s: SigJoin): string | null {
  const author = (s.author ?? "").trim();
  if (author) return canonicalPublisherKey(author);
  const srel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
  return srel?.name ? canonicalPublisherKey(srel.name) : null;
}

/** broke_at = the publish time at which a trend's signals first span
 * NEWS_PUBLISHER_BAR distinct publishers (sorted by publish time). Derived
 * from ALL linked signals so it reflects the true story timeline regardless
 * of the order we ingested the articles. Future times are clamped to now. */
function brokeAtFromSignals(sigs: SigJoin[]): string | null {
  const nowMs = Date.now();
  const items = sigs
    .map((s) => {
      const pub = publisherOf(s);
      const t = s.published_at ? new Date(s.published_at).getTime() : NaN;
      return pub && Number.isFinite(t) ? { pub, t: Math.min(t, nowMs) } : null;
    })
    .filter((x): x is { pub: string; t: number } => x != null)
    .sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.pub);
    if (seen.size >= NEWS_PUBLISHER_BAR) return new Date(it.t).toISOString();
  }
  return null;
}

/** first_seen = the earliest article in the story (its age). Future times
 * are clamped to now. */
function firstSeenFromSignals(sigs: SigJoin[]): string | null {
  const nowMs = Date.now();
  let firstMs = Infinity;
  for (const s of sigs) {
    if (!s.published_at) continue;
    const t = Math.min(new Date(s.published_at).getTime(), nowMs);
    if (Number.isFinite(t) && t < firstMs) firstMs = t;
  }
  return Number.isFinite(firstMs) ? new Date(firstMs).toISOString() : null;
}

/**
 * Recompute signal_count / publisher_count / trust / broke_at from what's
 * actually linked, and archive any trend that ended up with zero signals
 * (its members got pulled into a bigger cluster on a later tick).
 */
/**
 * Bulk-archive active trends not touched (reused / corroborated) in
 * ARCHIVE_AFTER_HOURS. ONE update — this is what stops the active set (and so
 * the reconcile scan below) from growing without bound. An archived trend
 * reactivates automatically if its cluster recurs in a later tick.
 */
async function archiveStaleTrends(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_HOURS * 3_600_000).toISOString();
  const { error, count } = await supabase
    .from("trends")
    .update({ status: "archived" }, { count: "exact" })
    .eq("status", "active")
    .lt("last_updated", cutoff);
  if (error) {
    console.warn("[cluster] archiveStaleTrends failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Delete signals published more than SIGNAL_RETENTION_DAYS ago. Keeps the signals
 * table small so loads + reconcile scans stay fast. Safe + well-aligned: the
 * clustering load window is only the last few hours, so a signal this old is
 * already dead weight, and active trends' signals are far newer than the cutoff.
 * Filters on published_at (indexed: idx_signals_published) so it never scans.
 */
async function purgeOldSignals(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - SIGNAL_RETENTION_DAYS * 86_400_000).toISOString();
  const { error, count } = await supabase
    .from("signals")
    .delete({ count: "exact" })
    .lt("published_at", cutoff)
    .order("published_at", { ascending: true })
    .limit(SIGNAL_PURGE_BATCH);
  if (error) {
    console.warn("[cluster] purgeOldSignals failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function reconcileTrendCounts(
  supabase: SupabaseClient
): Promise<{ reconciled: number; archived: number }> {
  // Only reconcile trends touched within the archive window — older trends are
  // archived by archiveStaleTrends() and don't need re-scanning every tick.
  const recentCutoff = new Date(Date.now() - ARCHIVE_AFTER_HOURS * 3_600_000).toISOString();
  const { data: trends, error } = await supabase
    .from("trends")
    .select("id, signal_count, publisher_count, status, trust_score, broke_at, first_seen")
    .neq("status", "archived")
    .gte("last_updated", recentCutoff);

  if (error || !trends) return { reconciled: 0, archived: 0 };

  type Row = {
    id: string;
    signal_count: number | null;
    publisher_count: number | null;
    status: string;
    trust_score: number | null;
    broke_at: string | null;
    first_seen: string | null;
  };
  const rows = trends as Row[];

  let reconciled = 0;
  let archived = 0;
  const CHUNK = 10;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (t) => {
        const { data: sigRows } = await supabase
          .from("signals")
          .select("source_id, published_at, author, sources(name, language)")
          .eq("topic_id", t.id);

        const sigs = (sigRows as SigJoin[] | null) ?? [];
        const actual = sigs.length;

        const publishers = new Set<string>();
        const languages = new Set<string>();
        for (const s of sigs) {
          const pub = publisherOf(s);
          if (pub) publishers.add(pub);
          const srel = Array.isArray(s.sources) ? s.sources[0] : s.sources;
          if (srel?.language) languages.add(srel.language);
        }

        // Archive when a trend has no signals OR has fallen below the
        // tracking bar (a single publisher) — those are invisible in every
        // feed anyway, so they shouldn't linger as "active" clutter. If it
        // regrows to >=2 publishers a later tick reuses + reactivates the row.
        const newStatus =
          actual === 0 || publishers.size < MIN_TRACK_PUBLISHERS ? "archived" : "active";
        const trust = computeTrust(publishers.size, languages);
        // Authoritative timeline from ALL the story's signals (not frozen at
        // creation, which depends on the order we ingested the articles):
        //   first_seen — earliest article = the story's age (drives buckets)
        //   broke_at   — when it reached 3 distinct publishers
        const newFirstSeen = firstSeenFromSignals(sigs) ?? t.first_seen;
        const newBrokeAt =
          publishers.size >= NEWS_PUBLISHER_BAR ? brokeAtFromSignals(sigs) : null;
        const iso = (v: string | null) => (v ? new Date(v).getTime() : null);
        const brokeChanged = iso(newBrokeAt) !== iso(t.broke_at);
        const firstChanged = iso(newFirstSeen) !== iso(t.first_seen);

        const needsUpdate =
          actual !== (t.signal_count ?? -1) ||
          publishers.size !== (t.publisher_count ?? -1) ||
          newStatus !== t.status ||
          trust !== (t.trust_score ?? 0) ||
          brokeChanged ||
          firstChanged;
        if (!needsUpdate) return;

        const { error: uErr } = await supabase
          .from("trends")
          .update({
            signal_count: actual,
            publisher_count: publishers.size,
            status: newStatus,
            trust_score: trust,
            broke_at: newBrokeAt,
            first_seen: newFirstSeen,
          })
          .eq("id", t.id);
        if (uErr) return;
        reconciled += 1;
        if (newStatus === "archived" && t.status !== "archived") archived += 1;
      })
    );
  }
  return { reconciled, archived };
}

// ─── AI categorisation ──────────────────────────────────────────

const SECTION_LABEL: Record<string, string> = {
  national: "National",
  world: "World",
  politics: "Politics",
  business: "Business",
  sports: "Sports",
  enter: "Entertainment",
  tech: "Tech",
};

/**
 * AI-categorise active trends not yet classified (categorized_at IS NULL).
 * Runs once per story — cheap. Graceful: if the column is missing (migration
 * 0027 not run) or no AI key is set, it no-ops and the lexical section stays.
 * Bounded to 60/tick so any backlog drains over a few ticks.
 */
async function categorizeTrends(
  supabase: SupabaseClient
): Promise<{ categorized: number }> {
  const { data, error } = await supabase
    .from("trends")
    .select("id, title")
    .eq("status", "active")
    .is("categorized_at", null)
    .order("last_updated", { ascending: false })
    .limit(60);
  if (error || !data || data.length === 0) return { categorized: 0 };

  const stories = (data as { id: string; title: string }[]).map((r) => ({
    id: r.id,
    title: r.title,
  }));
  const sections = await classifyStorySections(stories);
  if (sections.size === 0) return { categorized: 0 };

  const nowIso = new Date().toISOString();
  let categorized = 0;
  await Promise.all(
    [...sections.entries()].map(async ([id, section]) => {
      const { error: uErr } = await supabase
        .from("trends")
        .update({
          section,
          desk: SECTION_LABEL[section] ?? "National",
          is_national_or_world: section === "national" || section === "world",
          categorized_at: nowIso,
        })
        .eq("id", id);
      if (!uErr) categorized += 1;
    })
  );
  return { categorized };
}

// ─── Concurrency ────────────────────────────────────────────────

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
          console.warn("[cluster] worker error:", err instanceof Error ? err.message : err);
        }
      }
    })
  );
}
