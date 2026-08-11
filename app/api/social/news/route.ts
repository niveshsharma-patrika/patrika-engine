import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/social/news — active news trends (the dashboard's clustered,
 * corroborated stories) as a picker for creating social posts. Editor+admin. */
export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin" && session?.role !== "editor") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) return Response.json({ trends: [] });
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("trends")
      .select("id, title, title_hi, desk, publisher_count, last_updated")
      .eq("status", "active")
      .order("last_updated", { ascending: false })
      .limit(40);
    return Response.json({ trends: data ?? [] });
  } catch (err) {
    return Response.json(
      { trends: [], error: err instanceof Error ? err.message : "query failed" },
      { status: 500 }
    );
  }
}
