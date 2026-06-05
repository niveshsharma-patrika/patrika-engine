import Parser from "rss-parser";

import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const parser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
  },
});

const xcancelParser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent":
      "Patrika-Engine/1.0 RSS Reader (https://patrika.com; +editorial trend monitor for Patrika newsroom)",
    Accept: "application/rss+xml",
  },
});

type Verdict = "WORKS" | "EMPTY" | "ERROR" | "WAITLIST";

type Result = {
  id: string;
  name: string;
  type: string;
  url: string | null;
  is_active: boolean;
  verdict: Verdict;
  items: number;
  reason: string;
};

async function probe(url: string, isTwitter: boolean): Promise<{
  ok: boolean;
  items: number;
  reason: string;
  waitlist?: boolean;
}> {
  try {
    const p = isTwitter ? xcancelParser : parser;
    const feed = await p.parseURL(url);
    const items = feed.items?.length ?? 0;
    // xcancel returns a 1-item "not whitelisted" feed when our reader isn't approved
    if (
      isTwitter &&
      items === 1 &&
      (feed.title ?? "").toLowerCase().includes("not yet whitelist")
    ) {
      return { ok: false, items: 0, reason: "xcancel not whitelisted", waitlist: true };
    }
    if (items === 0) return { ok: false, items: 0, reason: "feed empty" };
    return { ok: true, items, reason: `${items} items` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, items: 0, reason: msg.slice(0, 140) };
  }
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { deactivate?: boolean };
  const shouldDeactivate = body.deactivate === true;

  const supabase = createAdminClient();
  const { data: sourcesRaw } = await supabase
    .from("sources")
    .select("id, name, source_type, url, is_active");

  type Src = { id: string; name: string; source_type: string; url: string | null; is_active: boolean };
  const sources = (sourcesRaw as Src[] | null) ?? [];

  const results: Result[] = [];
  const CONCURRENCY = 8;
  const queue = [...sources];

  async function worker() {
    while (queue.length) {
      const s = queue.shift();
      if (!s) return;
      if (!s.url) {
        results.push({
          id: s.id, name: s.name, type: s.source_type, url: null, is_active: s.is_active,
          verdict: "ERROR", items: 0, reason: "no URL configured",
        });
        continue;
      }
      const isTwitter = s.source_type === "twitter";
      const r = await probe(s.url, isTwitter);
      let verdict: Verdict;
      if (r.ok) verdict = "WORKS";
      else if (r.waitlist) verdict = "WAITLIST";
      else if (r.reason === "feed empty") verdict = "EMPTY";
      else verdict = "ERROR";
      results.push({
        id: s.id, name: s.name, type: s.source_type, url: s.url, is_active: s.is_active,
        verdict, items: r.items, reason: r.reason,
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // If deactivate=true, mark anything not WORKS or WAITLIST as inactive.
  // WAITLIST stays active because it's a transient block (waiting on email approval).
  let deactivatedCount = 0;
  if (shouldDeactivate) {
    const toDeactivate = results
      .filter((r) => r.is_active && r.verdict !== "WORKS" && r.verdict !== "WAITLIST")
      .map((r) => r.id);
    if (toDeactivate.length > 0) {
      const { error } = await supabase
        .from("sources")
        .update({ is_active: false })
        .in("id", toDeactivate);
      if (!error) deactivatedCount = toDeactivate.length;
    }
  }

  const summary = {
    total: results.length,
    works: results.filter((r) => r.verdict === "WORKS").length,
    empty: results.filter((r) => r.verdict === "EMPTY").length,
    error: results.filter((r) => r.verdict === "ERROR").length,
    waitlist: results.filter((r) => r.verdict === "WAITLIST").length,
    deactivated: deactivatedCount,
  };

  results.sort((a, b) =>
    a.verdict === b.verdict ? a.name.localeCompare(b.name) : a.verdict.localeCompare(b.verdict)
  );

  return Response.json({ summary, results });
}
