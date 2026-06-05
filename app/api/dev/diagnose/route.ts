import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const providers = await supabase
    .from("ai_providers")
    .select("provider_key, display_name, is_active, api_key_encrypted")
    .limit(20);
  const models = await supabase
    .from("ai_models")
    .select("model_key, display_name, provider_id, is_active")
    .limit(20);
  const config = await supabase
    .from("ai_config")
    .select(
      `use_case, system_prompt,
       ai_models!model_id ( model_key, ai_providers ( provider_key ) )`
    )
    .limit(20);

  return Response.json({
    providers: providers.data,
    providers_err: providers.error?.message,
    models: models.data,
    models_err: models.error?.message,
    config: config.data,
    config_err: config.error?.message,
    env_anthropic: process.env.ANTHROPIC_API_KEY ? "set" : "missing",
    env_google: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "set" : "missing",
  });
}
