import {
  PipelineSwitches,
  type PipelineRow,
} from "@/components/pipeline-switches";
import { createAdminClient } from "@/lib/supabase/server";
import { envOverrides } from "@/lib/pipeline-settings";
import { ProviderKeys } from "@/components/provider-keys";
import { AiRouting } from "@/components/ai-routing";

export const dynamic = "force-dynamic";

type ProviderRow = {
  id: string;
  provider_key: string;
  display_name: string;
  is_active: boolean;
  api_key_encrypted: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  desk: string | null;
  telegram_handle: string | null;
};

type UsageRow = {
  model_id: string | null;
  use_case: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

async function loadData() {
  if (!process.env.DATABASE_URL) {
    return { providers: [], models: [], profiles: [], usage: [], pipeline: [] };
  }
  const supabase = createAdminClient();
  const [providers, models, profiles, usage, pipeline] = await Promise.all([
    supabase.from("ai_providers").select("id, provider_key, display_name, is_active, api_key_encrypted"),
    supabase.from("ai_models").select("id, model_key, display_name, provider_id, input_price_per_million, output_price_per_million"),
    supabase.from("profiles").select("id, full_name, role, desk, telegram_handle").limit(50),
    supabase.from("ai_usage").select("model_id, use_case, input_tokens, output_tokens, cost_usd, created_at").gte("created_at", new Date(Date.now() - 30 * 86400e3).toISOString()).limit(2000),
    supabase.from("pipeline_settings").select("key, enabled, label, description, updated_at").order("key"),
  ]);
  return {
    providers: (providers.data as ProviderRow[] | null) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    models: (models.data as any[]) ?? [],
    profiles: (profiles.data as ProfileRow[] | null) ?? [],
    usage: (usage.data as UsageRow[] | null) ?? [],
    pipeline: (pipeline.data as PipelineRow[] | null) ?? [],
  };
}

const PROVIDER_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
};

// Canonical ordering for the pipeline rows in the UI — mirrors the
// runtime execution order so the stages read top-to-bottom.
const PIPELINE_ORDER: PipelineRow["key"][] = ["fetch", "enrich", "cluster"];

export default async function AdminPage() {
  const { providers, models, profiles, usage, pipeline } = await loadData();
  const overrides = envOverrides();

  const pipelineRows = [...pipeline].sort(
    (a, b) =>
      PIPELINE_ORDER.indexOf(a.key) - PIPELINE_ORDER.indexOf(b.key)
  );

  // Provider status: prefer DB key, fall back to env presence
  const providerStatus = providers.map((p) => {
    const dbKey = !!p.api_key_encrypted;
    const envVar = PROVIDER_ENV[p.provider_key];
    const envKey = envVar ? !!process.env[envVar] : false;
    return { ...p, dbKey, envKey, hasKey: dbKey || envKey };
  });

  const providerRows = providerStatus.map((p) => ({
    id: p.id,
    provider_key: p.provider_key,
    display_name: p.display_name,
    // Note: the env-var NAME is intentionally NOT sent to the client — only the
    // booleans below (dbKey/envKey/hasKey) cross to the admin UI.
    dbKey: p.dbKey,
    envKey: p.envKey,
    hasKey: p.hasKey,
    modelCount: models.filter((m) => m.provider_id === p.id).length,
  }));

  // Usage totals
  const totals = usage.reduce(
    (a, u) => ({
      input: a.input + (u.input_tokens ?? 0),
      output: a.output + (u.output_tokens ?? 0),
      cost: a.cost + Number(u.cost_usd ?? 0),
      calls: a.calls + 1,
    }),
    { input: 0, output: 0, cost: 0, calls: 0 }
  );

  return (
    <>
      <div className="flex items-end justify-between gap-6 pb-4 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-medium">Admin</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            API keys, users, AI usage. Telegram bot — coming later.
          </p>
        </div>
      </div>

      {/* Pipeline switches — per-stage on/off for the cron */}
      <section className="mb-8">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-medium">Pipeline switches</h2>
            <p className="text-[12px] text-[var(--text-3)] mt-0.5">
              Per-stage toggles for the 5-min ingest cron. Turn AI off here to
              stop the Gemini + Groq bill without disabling the cron itself.
              Env-var overrides (SKIP_FETCH, SKIP_CLUSTER) always win over the
              DB state.
            </p>
          </div>
        </div>
        {pipelineRows.length === 0 ? (
          <div className="bg-white border border-[var(--border)] rounded-md p-4 text-[13px] text-[var(--text-3)]">
            No <code className="font-mono text-[12px]">pipeline_settings</code>{" "}
            rows found. Run migration{" "}
            <code className="font-mono text-[12px]">
              0020_pipeline_settings.sql
            </code>{" "}
            in the Supabase SQL editor to populate the table.
          </div>
        ) : (
          <PipelineSwitches rows={pipelineRows} envOverrides={overrides} />
        )}
      </section>

      {/* AI Providers + Keys */}
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-[15px] font-medium">API Keys</h2>
          <p className="text-[12px] text-[var(--text-3)] mt-0.5">
            Set a provider&apos;s key to store it encrypted in the database — it overrides the
            environment variable and takes effect immediately. Clear it to fall back to the env var.
          </p>
        </div>
        <ProviderKeys providers={providerRows} />
      </section>

      {/* AI Model routing — which provider handles content vs images */}
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-[15px] font-medium">Model routing</h2>
          <p className="text-[12px] text-[var(--text-3)] mt-0.5">
            Choose which provider generates content (text) vs images. Keys come from API Keys above.
          </p>
        </div>
        <AiRouting />
      </section>

      {/* Users */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-medium">Users</h2>
          <button className="bg-[var(--text)] hover:bg-black text-white text-[13px] font-medium px-3.5 py-1.5 rounded">
            + Invite user
          </button>
        </div>
        <div className="bg-white border border-[var(--border)] rounded-md overflow-hidden">
          {profiles.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-3)] text-sm">
              No users yet. Set up Supabase Auth (sign in / sign up) to invite teammates.
            </div>
          ) : (
            profiles.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-[44px_1fr_140px_140px] gap-3.5 px-4 py-3 items-center border-t first:border-t-0 border-[var(--border)]"
              >
                <div className="w-9 h-9 grid place-items-center rounded-full bg-[var(--text)] text-white text-[12px] font-medium">
                  {u.full_name.split(" ").map((n) => n[0]?.toUpperCase()).slice(0, 2).join("")}
                </div>
                <div>
                  <div className="text-sm font-medium">{u.full_name}</div>
                  <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">{u.id.slice(0, 8)}</div>
                </div>
                <div className="font-mono text-[12px] text-[var(--text-2)]">{u.role}</div>
                <div className="font-mono text-[11px] text-[var(--text-3)]">
                  {u.telegram_handle ?? "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* AI Usage */}
      <section>
        <h2 className="text-[15px] font-medium mb-3">AI Usage (last 30 days)</h2>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-[var(--border)] rounded-md p-4">
            <div className="text-[20px] font-medium font-mono">${totals.cost.toFixed(2)}</div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mt-1">Total cost</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-md p-4">
            <div className="text-[20px] font-medium font-mono">{totals.calls}</div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mt-1">API calls</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-md p-4">
            <div className="text-[20px] font-medium font-mono">{(totals.input / 1000).toFixed(1)}k</div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mt-1">Input tokens</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-md p-4">
            <div className="text-[20px] font-medium font-mono">{(totals.output / 1000).toFixed(1)}k</div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mt-1">Output tokens</div>
          </div>
        </div>
        <p className="text-[12px] text-[var(--text-3)]">
          Usage tracking starts once drafts are generated and the model logs calls. Refinement during ingestion is also tracked here.
        </p>
      </section>
    </>
  );
}
