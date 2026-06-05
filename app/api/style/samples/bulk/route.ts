import { parse } from "csv-parse/sync";

import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/style/samples/bulk
 * Multipart form with field `file` containing a CSV.
 *
 * Expected columns (case-insensitive, order-independent):
 *   title       — required
 *   body        — required
 *   category    — optional, must match one of VALID_STORY_TYPES if present
 *                 (also accepted: 'story_type')
 *   source_url  — optional
 *   notes       — optional
 *
 * Returns:
 *   { inserted: N, skipped: [{ row, reason }, …] }
 *
 * Behaviour:
 *   • Empty or duplicate (same title + first 100 chars of body) rows are skipped.
 *   • Invalid category gets set to null (sample still saved, just untagged).
 *   • Hard error on the whole batch only if CSV parsing fails or DB write errors.
 */

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

// Normalise header names: lowercase, strip spaces, allow common aliases.
function normaliseHeader(h: string): string {
  const k = h.toLowerCase().trim().replace(/[\s_-]+/g, "_");
  if (k === "story_type") return "category";
  if (k === "url" || k === "link") return "source_url";
  if (k === "headline") return "title";
  if (k === "content" || k === "article" || k === "text") return "body";
  return k;
}

function pickStoryType(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  // Match case-insensitively but return the canonical spelling.
  for (const t of VALID_STORY_TYPES) {
    if (t.toLowerCase() === v.toLowerCase()) return t;
  }
  return null; // unknown category → save sample without tag
}

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Get the uploaded file
  let csvText: string;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded (field 'file')" }, { status: 400 });
    }
    csvText = await (file as File).text();
  } catch (err) {
    return Response.json(
      { error: `Could not read uploaded file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  if (!csvText.trim()) {
    return Response.json({ error: "Uploaded CSV is empty" }, { status: 400 });
  }

  // Parse CSV with header row, trim values, allow quoted fields with commas/newlines.
  type RawRow = Record<string, string>;
  let records: RawRow[];
  try {
    records = parse(csvText, {
      columns: (header: string[]) => header.map(normaliseHeader),
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true, // strip UTF-8 BOM Excel sometimes adds
    });
  } catch (err) {
    return Response.json(
      {
        error: `CSV parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 400 }
    );
  }

  // Validate + shape rows for insert.
  type Sample = {
    title: string;
    body: string;
    story_type: string | null;
    source_url: string | null;
    notes: string | null;
  };
  const inserts: Sample[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  const seenKeys = new Set<string>();

  records.forEach((row, idx) => {
    const lineNo = idx + 2; // header is row 1
    const title = (row.title ?? "").trim();
    const body = (row.body ?? "").trim();
    if (!title || !body) {
      skipped.push({ row: lineNo, reason: "missing title or body" });
      return;
    }
    const dedupKey = `${title.toLowerCase()}::${body.slice(0, 100).toLowerCase()}`;
    if (seenKeys.has(dedupKey)) {
      skipped.push({ row: lineNo, reason: "duplicate within this CSV" });
      return;
    }
    seenKeys.add(dedupKey);
    inserts.push({
      title,
      body,
      story_type: pickStoryType(row.category),
      source_url: row.source_url?.trim() || null,
      notes: row.notes?.trim() || null,
    });
  });

  if (inserts.length === 0) {
    return Response.json({
      inserted: 0,
      skipped,
      message: "No valid rows to import",
    });
  }

  // Insert in one shot. Supabase respects up to ~1000 rows per insert.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("style_samples")
    .insert(inserts)
    .select("id");

  if (error) {
    return Response.json(
      { error: `DB insert failed: ${error.message}`, attempted: inserts.length },
      { status: 500 }
    );
  }

  return Response.json({
    inserted: (data as { id: string }[] | null)?.length ?? inserts.length,
    skipped,
    total_rows: records.length,
  });
}
