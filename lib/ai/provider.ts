import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { createAdminClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";
import { decryptKey } from "@/lib/crypto";
import { AI_PROVIDERS, type ProviderKey, type UseCase } from "./registry";

/**
 * Look up the API key for a provider. Preference order:
 *   1. Encrypted key stored in `ai_providers` table
 *   2. Environment variable fallback
 */
export async function getApiKey(provider: ProviderKey): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_providers")
    .select("api_key_encrypted")
    .eq("provider_key", provider)
    .eq("is_active", true)
    .maybeSingle();

  if (data?.api_key_encrypted) {
    try {
      return decryptKey(data.api_key_encrypted);
    } catch (err) {
      console.error(`Failed to decrypt API key for ${provider}:`, err);
    }
  }

  const envVar = AI_PROVIDERS[provider].env_var;
  return process.env[envVar] ?? null;
}

/**
 * Instantiate an AI SDK language model for the given provider+model.
 */
function instantiate(
  provider: ProviderKey,
  modelKey: string,
  apiKey: string
): LanguageModel {
  switch (provider) {
    case "anthropic":
      // Force baseURL to override any ANTHROPIC_BASE_URL env that may be set
      // to the unversioned root URL.
      return createAnthropic({
        apiKey,
        baseURL: "https://api.anthropic.com/v1",
      })(modelKey);
    case "openai":
      return createOpenAI({ apiKey })(modelKey);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelKey);
    case "groq":
      return createGroq({ apiKey })(modelKey);
  }
}

type ResolvedModel = {
  model: LanguageModel;
  providerKey: ProviderKey;
  modelKey: string;
  systemPrompt: string | null;
};

/**
 * Zero-config default: if a Google key is in env, route to Gemini 2.0 Flash.
 * This lets angle generation + drafting work the moment the key is set,
 * without any admin DB wiring (ai_config / ai_providers rows).
 */
async function envFallback(): Promise<ResolvedModel | null> {
  // Zero-config default when no admin DB model is wired. getApiKey prefers a
  // panel-stored (DB) key over the env var, so the Admin → API Keys key is
  // authoritative even without an ai_config row. Prefer OpenAI (gpt-4o-mini)
  // when a key is available; otherwise fall back to Gemini.
  // Override the exact model with OPENAI_MODEL / GEMINI_MODEL.
  const openaiKey = await getApiKey("openai");
  if (openaiKey) {
    const modelKey = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return {
      model: createOpenAI({ apiKey: openaiKey })(modelKey),
      providerKey: "openai",
      modelKey,
      systemPrompt: null,
    };
  }
  const googleKey = await getApiKey("google");
  if (googleKey) {
    const modelKey = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    return {
      model: createGoogleGenerativeAI({ apiKey: googleKey })(modelKey),
      providerKey: "google",
      modelKey,
      systemPrompt: null,
    };
  }
  return null;
}

// Default model per provider when a provider is selected but not a model.
export const DEFAULT_CONTENT_MODEL: Record<ProviderKey, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  groq: "llama-3.3-70b-versatile",
  google: "gemini-2.5-flash",
};
export const DEFAULT_IMAGE_MODEL: Record<"openai" | "google", string> = {
  openai: "gpt-image-1",
  google: "imagen-4.0-generate-001",
};

/** The admin-selected provider/model for a purpose (ai_routing table). */
export async function getRouting(
  purpose: "content" | "image"
): Promise<{ provider: ProviderKey; model: string } | null> {
  try {
    const { rows } = await pool.query<{ provider: string; model: string | null }>(
      "SELECT provider, model FROM ai_routing WHERE purpose = $1 LIMIT 1",
      [purpose]
    );
    const row = rows[0];
    if (!row || !(row.provider in AI_PROVIDERS)) return null;
    const provider = row.provider as ProviderKey;
    const fallback =
      purpose === "image"
        ? DEFAULT_IMAGE_MODEL[provider as "openai" | "google"] ?? DEFAULT_IMAGE_MODEL.openai
        : DEFAULT_CONTENT_MODEL[provider];
    return { provider, model: row.model || fallback };
  } catch {
    return null; // table missing / transient → callers fall back
  }
}

/**
 * Resolve the image provider/model/key. Only OpenAI + Google can generate
 * images; anything else (or nothing selected) falls back to OpenAI. Returns
 * null if the chosen provider has no key.
 */
export async function getImageRouting(): Promise<
  { providerKey: "openai" | "google"; modelKey: string; apiKey: string } | null
> {
  const routing = await getRouting("image");
  // Honor an explicit selection when that provider actually has a key.
  if (routing && (routing.provider === "openai" || routing.provider === "google")) {
    const apiKey = await getApiKey(routing.provider);
    if (apiKey) {
      return {
        providerKey: routing.provider,
        modelKey: routing.model || DEFAULT_IMAGE_MODEL[routing.provider],
        apiKey,
      };
    }
  }
  // No selection (or the selected provider has no key) → use whichever image
  // provider has a key, OpenAI first then Google.
  for (const p of ["openai", "google"] as const) {
    const apiKey = await getApiKey(p);
    if (apiKey) return { providerKey: p, modelKey: DEFAULT_IMAGE_MODEL[p], apiKey };
  }
  return null;
}

/**
 * Resolve which model to use for a given use case, based on admin config.
 * Returns the LanguageModel + metadata, or null if unconfigured / no key.
 *
 * Local-Ollama override: when USE_LOCAL_AI=1 in env, we short-circuit the
 * DB lookup and route every use case to a local Ollama server via its
 * OpenAI-compatible endpoint. Useful when the cloud provider's quota is
 * exhausted, or for offline dev. Set OLLAMA_BASE_URL to override the host.
 */
export async function getModelFor(
  useCase: UseCase
): Promise<ResolvedModel | null> {
  if (process.env.USE_LOCAL_AI === "1") {
    const modelKey = process.env.LOCAL_AI_MODEL ?? "qwen2.5:14b";
    const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
    // Ollama's OpenAI-compat endpoint ignores the API key but the SDK requires
    // a non-empty string.
    const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
    return {
      model: ollama(modelKey),
      // "ollama" isn't in the ProviderKey union; cast — consumers use this
      // for display/diagnostics only, no switch statements depend on it.
      providerKey: "ollama" as ProviderKey,
      modelKey,
      systemPrompt: null,
    };
  }

  // Admin-configured model for this use case (ai_config → ai_models → ai_providers).
  // Fetched first so the per-use-case system prompt survives even when the admin
  // overrides the provider below.
  type ConfigRow = { system_prompt: string | null; model_key: string; provider_key: string };
  const { rows } = await pool
    .query<ConfigRow>(
      `SELECT c.system_prompt, m.model_key, p.provider_key
         FROM ai_config c
         JOIN ai_models m ON m.id = c.model_id
         JOIN ai_providers p ON p.id = m.provider_id
        WHERE c.use_case = $1
        LIMIT 1`,
      [useCase]
    )
    .catch(() => ({ rows: [] as ConfigRow[] }));
  const row = rows[0];
  const systemPrompt = row?.system_prompt ?? null;

  // Admin-selected content provider (Admin → Model routing) overrides the
  // provider/model for every text use case — but keeps the ai_config system prompt.
  const contentRouting = await getRouting("content");
  if (contentRouting) {
    const apiKey = await getApiKey(contentRouting.provider);
    if (apiKey) {
      return {
        model: instantiate(contentRouting.provider, contentRouting.model, apiKey),
        providerKey: contentRouting.provider,
        modelKey: contentRouting.model,
        systemPrompt,
      };
    }
    console.warn(
      `Content provider "${contentRouting.provider}" is selected but has no key; falling back.`
    );
  }

  // No admin config row for this use case → fall back to the env default.
  if (!row) return envFallback();

  const providerKey = row.provider_key as ProviderKey | undefined;
  const modelKey = row.model_key as string | undefined;
  if (!providerKey || !modelKey) return null;

  const apiKey = await getApiKey(providerKey);
  if (!apiKey) {
    console.warn(
      `No API key configured for provider "${providerKey}" (use case: ${useCase})`
    );
    return envFallback();
  }

  return {
    model: instantiate(providerKey, modelKey, apiKey),
    providerKey,
    modelKey,
    systemPrompt: row.system_prompt ?? null,
  };
}
