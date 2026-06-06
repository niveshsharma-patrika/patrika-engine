import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { createAdminClient } from "@/lib/supabase/server";
import { decryptKey } from "@/lib/crypto";
import { AI_PROVIDERS, type ProviderKey, type UseCase } from "./registry";

/**
 * Look up the API key for a provider. Preference order:
 *   1. Encrypted key stored in `ai_providers` table
 *   2. Environment variable fallback
 */
async function getApiKey(provider: ProviderKey): Promise<string | null> {
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
function envFallback(): ResolvedModel | null {
  // Zero-config default when no admin DB model is wired. Prefer OpenAI
  // (gpt-4o-mini) when OPENAI_API_KEY is set; otherwise fall back to Gemini.
  // Override the exact model with OPENAI_MODEL / GEMINI_MODEL.
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const modelKey = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    return {
      model: createOpenAI({ apiKey: openaiKey })(modelKey),
      providerKey: "openai",
      modelKey,
      systemPrompt: null,
    };
  }
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ai_config")
    .select(
      `
      system_prompt,
      ai_models!model_id (
        model_key,
        ai_providers ( provider_key )
      )
    `
    )
    .eq("use_case", useCase)
    .maybeSingle();

  // No admin config row for this use case → fall back to Gemini if a key is set.
  if (error || !data?.ai_models) return envFallback();

  // Supabase joins return arrays or objects depending on relationship — coerce.
  const modelRow = Array.isArray(data.ai_models) ? data.ai_models[0] : data.ai_models;
  const providerRow = Array.isArray(modelRow.ai_providers)
    ? modelRow.ai_providers[0]
    : modelRow.ai_providers;

  const providerKey = providerRow?.provider_key as ProviderKey | undefined;
  const modelKey = modelRow?.model_key as string | undefined;
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
    systemPrompt: data.system_prompt ?? null,
  };
}
