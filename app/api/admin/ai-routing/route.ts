import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AI_PROVIDERS, type ProviderKey } from "@/lib/ai/registry";
import { DEFAULT_CONTENT_MODEL, DEFAULT_IMAGE_MODEL, getApiKey } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/**
 * Admin picks which provider/model handles content (text) vs image generation.
 * Keys still come from Admin → API Keys (ai_providers). Stored in ai_routing.
 */
const CONTENT_PROVIDERS = ["openai", "anthropic", "groq", "google"] as const;
const IMAGE_PROVIDERS = ["openai", "google"] as const;

// Image model options per provider (text models live in the registry). Kept to
// models the image route handles correctly (gpt-image-1 takes size 1536x1024,
// Imagen takes aspectRatio 16:9) — dall-e-3 / gemini-*-image need different
// params, so they're intentionally not offered.
const IMAGE_MODELS: Record<string, string[]> = {
  openai: ["gpt-image-1", "gpt-image-1-mini"],
  google: ["imagen-4.0-generate-001", "imagen-4.0-fast-generate-001"],
};

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  let rows: Array<{ purpose: string; provider: string; model: string | null }> = [];
  try {
    rows = (await pool.query("SELECT purpose, provider, model FROM ai_routing")).rows;
  } catch {
    // table not migrated yet → defaults below
  }
  const byPurpose = Object.fromEntries(rows.map((r) => [r.purpose, r]));

  const contentProviders = CONTENT_PROVIDERS.map((k) => ({
    key: k,
    name: AI_PROVIDERS[k].name,
    models: AI_PROVIDERS[k].models.map((m) => ({ key: m.key, name: m.name })),
  }));
  const imageProviders = IMAGE_PROVIDERS.map((k) => ({
    key: k,
    name: AI_PROVIDERS[k].name,
    models: IMAGE_MODELS[k].map((m) => ({ key: m, name: m })),
  }));

  // When nothing is saved yet, show the provider that would ACTUALLY be used
  // (the first one that has a key) so the panel isn't misleading.
  async function firstWithKey(order: readonly string[]): Promise<string> {
    for (const p of order) {
      if (await getApiKey(p as ProviderKey)) return p;
    }
    return order[0];
  }
  const contentProvider = byPurpose.content?.provider ?? (await firstWithKey(["openai", "google"]));
  const imageProvider = byPurpose.image?.provider ?? (await firstWithKey(["openai", "google"]));
  return Response.json({
    content: {
      provider: contentProvider,
      model:
        byPurpose.content?.model ||
        DEFAULT_CONTENT_MODEL[contentProvider as keyof typeof DEFAULT_CONTENT_MODEL] ||
        "",
    },
    image: {
      provider: imageProvider,
      model:
        byPurpose.image?.model ||
        DEFAULT_IMAGE_MODEL[imageProvider as keyof typeof DEFAULT_IMAGE_MODEL] ||
        DEFAULT_IMAGE_MODEL.openai,
    },
    contentProviders,
    imageProviders,
  });
}

const Body = z.object({
  purpose: z.enum(["content", "image"]),
  provider: z.string(),
  model: z.string().nullish(),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { purpose, provider } = parsed.data;
  const model = parsed.data.model?.trim() || null;

  const allowed: readonly string[] = purpose === "image" ? IMAGE_PROVIDERS : CONTENT_PROVIDERS;
  if (!allowed.includes(provider)) {
    return Response.json(
      { error: `${provider} can't be used for ${purpose} generation.` },
      { status: 400 }
    );
  }
  // A non-empty model must be one this provider actually offers (empty → default).
  if (model) {
    const validModels =
      purpose === "image"
        ? IMAGE_MODELS[provider] ?? []
        : AI_PROVIDERS[provider as ProviderKey]?.models.map((m) => m.key) ?? [];
    if (!validModels.includes(model)) {
      return Response.json({ error: `"${model}" isn't a valid model for ${provider}.` }, { status: 400 });
    }
  }

  try {
    await pool.query(
      `INSERT INTO ai_routing (purpose, provider, model, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (purpose)
       DO UPDATE SET provider = EXCLUDED.provider, model = EXCLUDED.model, updated_at = now()`,
      [purpose, provider, model]
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("ai-routing save failed:", e);
    return Response.json({ error: "Could not save. Has the ai_routing migration been run?" }, { status: 500 });
  }
}
