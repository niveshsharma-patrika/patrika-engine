import { createAdminClient } from "@/lib/supabase/server";
import {
  envOverrides,
  type PipelineStageKey,
} from "@/lib/pipeline-settings";

export const dynamic = "force-dynamic";

const VALID_KEYS: ReadonlySet<PipelineStageKey> = new Set([
  "fetch",
  "enrich",
  "cluster",
]);

type PipelineRow = {
  key: PipelineStageKey;
  enabled: boolean;
  label: string;
  description: string | null;
  updated_at: string;
};

/**
 * GET /api/admin/pipeline
 * Returns the current state of all pipeline switches, with env overrides
 * flagged so the UI can disable toggles that the env is forcing off.
 */
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pipeline_settings")
    .select("key, enabled, label, description, updated_at")
    .order("key");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    settings: (data as PipelineRow[] | null) ?? [],
    env_overrides: envOverrides(),
  });
}

/**
 * POST /api/admin/pipeline { key, enabled }
 * Flip a single switch. Env overrides are honoured at read time
 * (lib/pipeline-settings.ts), so this endpoint always writes the
 * requested state — the UI can show the truth without the API needing
 * to refuse the write.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    enabled?: boolean;
  } | null;

  if (!body?.key || !VALID_KEYS.has(body.key as PipelineStageKey)) {
    return Response.json(
      {
        error: `key must be one of: ${[...VALID_KEYS].join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "enabled (boolean) required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pipeline_settings")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("key", body.key);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
