import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getSecret, hasSecret, setSecret } from "@/lib/twitter/secrets";

/**
 * The API key WordPress sends (`X-API-Key`) to call the Hindi → English
 * translation API (POST /api/v1/translate). Stored encrypted in
 * integration_secrets; generated in Admin → Translations.
 */
export const TRANSLATION_API_KEY = "translation_api_key";

export async function getTranslationApiKey(): Promise<string | null> {
  const v = ((await getSecret(TRANSLATION_API_KEY)) || process.env.TRANSLATION_API_KEY || "").trim();
  return v || null;
}

/** Constant-time check of a presented key against the stored one. */
export async function checkApiKey(presented: string | null): Promise<boolean> {
  const key = await getTranslationApiKey();
  if (!key || !presented) return false;
  const a = createHash("sha256").update(presented.trim()).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

/** Generate + store a fresh API key; returns it (shown to the admin once). */
export async function rotateApiKey(): Promise<string> {
  const key = `kt_${randomBytes(32).toString("hex")}`;
  await setSecret(TRANSLATION_API_KEY, key);
  return key;
}

export async function translationKeyStatus() {
  const s = await hasSecret(TRANSLATION_API_KEY);
  return { apiKeySet: s.set || Boolean(process.env.TRANSLATION_API_KEY), apiKeyUpdatedAt: s.updatedAt };
}
