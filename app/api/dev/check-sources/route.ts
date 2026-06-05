import { fetchSitemapNews } from "@/lib/sources/sitemap-news";
import { fetchRssFeed } from "@/lib/sources/rss";
import { fetchGoogleNews } from "@/lib/sources/google-news";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Read-only source health check.
 *
 * Pulls every active source from the DB, hits its configured feed URL
 * via the matching fetcher, and reports the article count returned today
 * (after the today-IST filter). Does NOT insert anything — purely verifies
 * each source is alive and returning content.
 *
 * Use this when you've just cleaned the DB and want to know which sources
 * will contribute on the next ingest, without actually triggering one.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, url, source_type, is_active, language, focus")
    .eq("is_active", true)
    .order("name", { ascending: true });

  type SourceRow = {
    id: string;
    name: string;
    url: string | null;
    source_type: string;
    is_active: boolean;
    language: string | null;
    focus: string | null;
  };

  const rows = (sources as SourceRow[] | null) ?? [];

  // Run 6 fetches in parallel for speed; same concurrency as ingest.
  const CONCURRENCY = 6;
  type Outcome = {
    name: string;
    language: string | null;
    focus: string | null;
    source_type: string;
    todayArticles: number;
    status: "ok" | "empty" | "error";
    error: string | null;
  };
  const results: Outcome[] = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (s): Promise<Outcome> => {
        if (!s.url) {
          return {
            name: s.name,
            language: s.language,
            focus: s.focus,
            source_type: s.source_type,
            todayArticles: 0,
            status: "error",
            error: "no URL configured",
          };
        }
        try {
          const items =
            s.source_type === "sitemap_news"
              ? await fetchSitemapNews(s.url, s.name)
              : s.source_type === "google_news"
              ? await fetchGoogleNews(s.url, s.name)
              : await fetchRssFeed(s.url, s.name);
          return {
            name: s.name,
            language: s.language,
            focus: s.focus,
            source_type: s.source_type,
            todayArticles: items.length,
            status: items.length > 0 ? "ok" : "empty",
            error: null,
          };
        } catch (err) {
          return {
            name: s.name,
            language: s.language,
            focus: s.focus,
            source_type: s.source_type,
            todayArticles: 0,
            status: "error",
            error: err instanceof Error ? err.message.slice(0, 120) : String(err),
          };
        }
      })
    );
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    empty: results.filter((r) => r.status === "empty").length,
    error: results.filter((r) => r.status === "error").length,
    totalArticlesAvailable: results.reduce((a, r) => a + r.todayArticles, 0),
  };

  return Response.json({ summary, results });
}
