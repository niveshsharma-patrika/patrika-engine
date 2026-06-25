import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { generateStoryAngles } from "@/lib/ai/angles";
import type { StoryAngle } from "@/lib/data/trends";

export const dynamic = "force-dynamic";

const Body = z.object({
  trendId: z.string().min(1),
  lang: z.enum(["en", "hi"]).default("en"),
  regenerate: z.boolean().default(false),
});

type SigRow = {
  author: string | null;
  content: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  sources: { name: string } | { name: string }[] | null;
};

/**
 * POST /api/angles/generate — generate (or return saved) editorial angles for
 * one story. Reads ALL the story's linked articles, asks the model for 2-3
 * distinct angles, persists them on the trend, and returns them. Saved once;
 * subsequent calls return the saved set unless { regenerate: true }.
 */
export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { trendId, lang, regenerate } = parsed.data;

  const supabase = createAdminClient();

  const { data: trend } = await supabase
    .from("trends")
    .select("id, title, section, desk, angles, primary_lang")
    .eq("id", trendId)
    .maybeSingle();

  if (!trend) {
    return Response.json({ error: "Story not found." }, { status: 404 });
  }

  // Return the saved set unless a regenerate was explicitly requested.
  const existing = (trend as { angles?: StoryAngle[] | null }).angles;
  if (existing && Array.isArray(existing) && existing.length > 0 && !regenerate) {
    return Response.json({ angles: existing, cached: true });
  }

  // Load ALL the story's articles (full coverage), build a compact digest.
  const { data: sigData } = await supabase
    .from("signals")
    .select("author, content, description, metadata, sources(name)")
    .eq("topic_id", trendId)
    .limit(30);

  const seen = new Set<string>();
  const coverage: Array<{ publisher: string; text: string }> = [];
  for (const s of (sigData as SigRow[] | null) ?? []) {
    const src = Array.isArray(s.sources) ? s.sources[0] : s.sources;
    const publisher = (s.author ?? src?.name ?? "Source").trim();
    const meta = s.metadata ?? {};
    const metaTitle = typeof meta.title === "string" ? meta.title : "";
    const metaSnippet = typeof meta.snippet === "string" ? meta.snippet : "";
    const content = (s.content ?? "").trim();
    const headline = metaTitle || content.split(" — ")[0];
    const body = s.description || metaSnippet || content.split(" — ").slice(1).join(" — ");
    const text = [headline, body].filter(Boolean).join(" — ").slice(0, 400);
    if (!text) continue;
    const key = `${publisher}|${text.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    coverage.push({ publisher, text });
  }

  const t = trend as { title: string; section: string | null; desk: string | null };
  const result = await generateStoryAngles({
    title: t.title,
    section: t.desk ?? t.section,
    lang,
    coverage,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 503 });
  }

  // Persist (best-effort — works before migration 0026, just won't save).
  const { error: saveErr } = await supabase
    .from("trends")
    .update({ angles: result.angles, angles_at: new Date().toISOString() })
    .eq("id", trendId);
  if (saveErr) {
    console.warn(`[angles] save failed (did migration 0026 run?): ${saveErr.message}`);
  }

  return Response.json({
    angles: result.angles,
    cached: false,
    saved: !saveErr,
    meta: result.meta,
  });
}

/**
 * GET /api/angles/generate?trendId=<uuid> — return SAVED angles for a story,
 * or { angles: null } if none yet. Never generates (no token spend), and is
 * resilient to the `angles` column not existing yet (returns null) so the
 * board/drawer never break on migration timing.
 */
export async function GET(req: Request) {
  const trendId = new URL(req.url).searchParams.get("trendId");
  if (!trendId || !process.env.DATABASE_URL) {
    return Response.json({ angles: null });
  }
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("trends")
      .select("angles")
      .eq("id", trendId)
      .maybeSingle();
    if (error) return Response.json({ angles: null }); // column may not exist yet
    const angles = (data as { angles?: StoryAngle[] | null } | null)?.angles ?? null;
    return Response.json({ angles });
  } catch {
    return Response.json({ angles: null });
  }
}
