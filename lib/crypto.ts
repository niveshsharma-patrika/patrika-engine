import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM encryption helpers for storing API keys in the DB.
 *
 * Uses KEY_ENCRYPTION_SECRET as the source for a 32-byte key.
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET is not set. Generate one with: openssl rand -hex 32"
    );
  }
  // Hash the secret to guarantee a 32-byte key regardless of input length.
  return createHash("sha256").update(secret).digest();
}

export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12);
  const key = getKey();
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptKey(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * Show the last 4 characters of a key with everything else masked.
 * e.g. "sk-ant-api03-•••••8f2x"
 */
export function maskKey(key: string, prefixLen = 12): string {
  if (key.length <= prefixLen + 4) return "•".repeat(key.length);
  return `${key.slice(0, prefixLen)}•••••${key.slice(-4)}`;
}
