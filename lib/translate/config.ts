import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getSecret, hasSecret, setSecret } from "@/lib/twitter/secrets";

/**
 * Credentials + callback target for the Hindi → English translation API that
 * WordPress calls (POST /api/v1/translate). Both live in the encrypted
 * integration_secrets store and are managed in Admin → Translations.
 *
 *  • API key  — WordPress sends it as `X-API-Key`; we also use it to sign every
 *    callback (HMAC-SHA256), so WordPress can verify a callback came from us.
 *  • Callback URL — where finished translations are POSTed. A request may name
 *    its own callback_url, but only on the SAME origin (no open SSRF relay).
 */
export const TRANSLATION_API_KEY = "translation_api_key";
export const TRANSLATION_CALLBACK_URL = "translation_callback_url";

export async function getTranslationApiKey(): Promise<string | null> {
  const v = ((await getSecret(TRANSLATION_API_KEY)) || process.env.TRANSLATION_API_KEY || "").trim();
  return v || null;
}

export async function getTranslationCallbackUrl(): Promise<string | null> {
  const v = ((await getSecret(TRANSLATION_CALLBACK_URL)) || process.env.TRANSLATION_CALLBACK_URL || "").trim();
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

export async function setCallbackUrl(url: string): Promise<void> {
  await setSecret(TRANSLATION_CALLBACK_URL, url.trim());
}

export async function translationSettingsStatus() {
  const [key, cb] = await Promise.all([hasSecret(TRANSLATION_API_KEY), getTranslationCallbackUrl()]);
  return { apiKeySet: key.set || Boolean(process.env.TRANSLATION_API_KEY), apiKeyUpdatedAt: key.updatedAt, callbackUrl: cb };
}

/** An http(s) URL, https unless it's a local test host. */
export function isValidCallbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve where a job's result goes: the request's own callback_url if it is on
 * the configured callback's origin, else the configured URL. Null = rejected.
 */
export function resolveCallbackUrl(requested: string | null, configured: string | null): string | null {
  if (!configured || !isValidCallbackUrl(configured)) return null;
  if (!requested) return configured;
  if (!isValidCallbackUrl(requested)) return null;
  return new URL(requested).origin === new URL(configured).origin ? requested : null;
}

/** `sha256=<hex>` HMAC of the exact callback body, keyed by the API key. */
export function signBody(body: string, key: string): string {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}
