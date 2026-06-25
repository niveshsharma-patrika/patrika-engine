import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/style/samples         → list all samples (newest first)
 * POST /api/style/samples         → create a new sample
 *
 * Each sample is a full Patrika article (title + body) plus optional
 * story_type tag. The drafting prompt picks 2-3 matching by story_type.
 */

type SampleRow = {
  id: string;
  title: string;
  body: string;
  story_type: string | null;
  publication: string | null;
  writer: string | null;
  source_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const VALID_STORY_TYPES = new Set([
  "Breaking news",
  "Analysis",
  "Explainer",
  "Profile",
  "Service piece",
  "Investigation",
  "Op-ed",
  "Sidebar",
  "Feature",
]);

const VALID_PUBLICATIONS = new Set([
  "Patrika",
  "New York Times",
  "Reuters",
  "Al Jazeera",
  "BBC",
  "Bloomberg",
]);

const SAMPLE_COLS =
  "id, title, body, story_type, publication, writer, source_url, notes, created_at, updated_at";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ samples: [], reason: "supabase_not_configured" });
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("style_samples")
    .select(SAMPLE_COLS)
    .order("created_at", { ascending: false })
    .limit(200);
  return Response.json({ samples: (data as SampleRow[] | null) ?? [] });
}

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }
  let body: {
    title?: string;
    body?: string;
    story_type?: string;
    publication?: string;
    writer?: string;
    source_url?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").toString().trim();
  const articleBody = (body.body ?? "").toString().trim();
  if (!title || !articleBody) {
    return Response.json(
      { error: "title and body are required" },
      { status: 400 }
    );
  }

  // story_type is optional; if provided, must match the AI taxonomy
  const story_type =
    body.story_type && VALID_STORY_TYPES.has(body.story_type.trim())
      ? body.story_type.trim()
      : null;

  // publication defaults to Patrika; writer is a free-text byline/voice label
  const publication =
    body.publication && VALID_PUBLICATIONS.has(body.publication.trim())
      ? body.publication.trim()
      : "Patrika";
  const writer = body.writer?.toString().trim() || null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("style_samples")
    .insert({
      title,
      body: articleBody,
      story_type,
      publication,
      writer,
      source_url: body.source_url?.toString() || null,
      notes: body.notes?.toString() || null,
    })
    .select(SAMPLE_COLS)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sample: data });
}
