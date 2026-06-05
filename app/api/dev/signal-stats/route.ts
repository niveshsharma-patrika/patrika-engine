import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: per-source actual signal counts in DB.
 * Not capped at 1000 like source-audit's count() — uses head:true + count:exact
 * which returns the true number even for large tables.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }
  const supabase = createAdminClient();

  // Total signals
  const { count: total } = await supabase
    .from("signals")
    .select("*", { count: "exact", head: true });

  // Per-source counts via grouped query
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, source_type, is_active")
    .eq("is_active", true);

  type Src = { id: string; name: string; source_type: string; is_active: boolean };
  const perSource: Array<{ name: string; type: string; count: number }> = [];
  for (const src of (sources as Src[] | null) ?? []) {
    const { count } = await supabase
      .from("signals")
      .select("*", { count: "exact", head: true })
      .eq("source_id", src.id);
    perSource.push({ name: src.name, type: src.source_type, count: count ?? 0 });
  }
  perSource.sort((a, b) => b.count - a.count);

  // Time range of signals
  const { data: bounds } = await supabase
    .from("signals")
    .select("ingested_at, published_at")
    .order("ingested_at", { ascending: false })
    .limit(1);
  const { data: earliestIngested } = await supabase
    .from("signals")
    .select("ingested_at")
    .order("ingested_at", { ascending: true })
    .limit(1);
  const { data: earliestPublished } = await supabase
    .from("signals")
    .select("published_at")
    .order("published_at", { ascending: true })
    .limit(1);

  return Response.json({
    total,
    perSource,
    timeRange: {
      ingestedFirst: (earliestIngested as { ingested_at: string }[] | null)?.[0]?.ingested_at ?? null,
      ingestedLatest: (bounds as { ingested_at: string }[] | null)?.[0]?.ingested_at ?? null,
      publishedEarliest: (earliestPublished as { published_at: string }[] | null)?.[0]?.published_at ?? null,
      publishedLatest: (bounds as { published_at: string }[] | null)?.[0]?.published_at ?? null,
    },
  });
}
