import { pool } from "@/lib/db";
import { decryptKey, encryptKey } from "@/lib/crypto";

/**
 * Encrypted integration secrets (currently just the X `auth_token` cookie).
 *
 * Same AES-256-GCM scheme as the AI provider keys — see lib/crypto.ts. Stored
 * in the DB rather than .env so the desk can refresh an expired cookie from the
 * admin UI without SSH access. Cookie expiry is the most common way this
 * feature breaks, so making the fix self-service matters.
 */

export const X_AUTH_TOKEN = "x_auth_token";

export async function getSecret(key: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ value_encrypted: string }>(
      `SELECT value_encrypted FROM integration_secrets WHERE key = $1 LIMIT 1`,
      [key]
    );
    const payload = rows[0]?.value_encrypted;
    if (!payload) return null;
    return decryptKey(payload);
  } catch (err) {
    // A missing table (migration not yet run) or an undecryptable value must
    // not throw into the crawl loop — the caller treats null as "not set up".
    console.error(`[twitter] failed to read secret "${key}":`, err);
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  const encrypted = encryptKey(value);
  await pool.query(
    `INSERT INTO integration_secrets (key, value_encrypted, updated_at)
          VALUES ($1, $2, now())
     ON CONFLICT (key)
     DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = now()`,
    [key, encrypted]
  );
}

/** Whether a secret exists — without decrypting or returning it. */
export async function hasSecret(key: string): Promise<{ set: boolean; updatedAt: string | null }> {
  try {
    const { rows } = await pool.query<{ updated_at: string }>(
      `SELECT updated_at FROM integration_secrets WHERE key = $1 LIMIT 1`,
      [key]
    );
    return { set: rows.length > 0, updatedAt: rows[0]?.updated_at ?? null };
  } catch {
    return { set: false, updatedAt: null };
  }
}
