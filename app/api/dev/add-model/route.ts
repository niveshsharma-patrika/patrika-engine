import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only: register a new model in ai_models so /api/dev/swap-model can target it.
 *   POST { providerKey, modelKey, displayName?, contextWindow?, inputPrice?, outputPrice? }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    providerKey?: string;
    modelKey?: string;
    displayName?: string;
    contextWindow?: number;
    inputPrice?: number;
    outputPrice?: number;
  } | null;

  if (!body?.providerKey || !body?.modelKey) {
    return Response.json(
      { error: "providerKey and modelKey required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: provider } = await supabase
    .from("ai_providers")
    .select("id")
    .eq("provider_key", body.providerKey)
    .maybeSingle();

  if (!provider) {
    return Response.json(
      { error: `Provider ${body.providerKey} not found` },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("ai_models")
    .upsert(
      {
        provider_id: (provider as { id: string }).id,
        model_key: body.modelKey,
        display_name: body.displayName ?? body.modelKey,
        context_window: body.contextWindow ?? null,
        input_price_per_million: body.inputPrice ?? null,
        output_price_per_million: body.outputPrice ?? null,
        capabilities: {},
        is_active: true,
      },
      { onConflict: "provider_id,model_key" }
    )
    .select("id, model_key")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, model: data });
}
