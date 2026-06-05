import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: swap which model is wired to a given use case.
 *   POST /api/dev/swap-model { useCase, providerKey, modelKey }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const { useCase, providerKey, modelKey } = (await req.json()) as {
    useCase?: string;
    providerKey?: string;
    modelKey?: string;
  };

  if (!useCase || !providerKey || !modelKey) {
    return Response.json(
      { error: "useCase, providerKey, modelKey required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: model } = await supabase
    .from("ai_models")
    .select("id, ai_providers!inner(provider_key)")
    .eq("model_key", modelKey)
    .eq("ai_providers.provider_key", providerKey)
    .maybeSingle();

  if (!model?.id) {
    return Response.json(
      { error: `Model ${providerKey}/${modelKey} not found in ai_models` },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("ai_config")
    .update({ model_id: model.id, updated_at: new Date().toISOString() })
    .eq("use_case", useCase);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    use_case: useCase,
    model: `${providerKey}/${modelKey}`,
  });
}
