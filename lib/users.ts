/**
 * Parse an optional WordPress author id from an untrusted request body.
 * Blank / missing → null (clears it); a positive whole number → that number;
 * anything else → invalid (the caller returns a 400).
 */
export function parseAuthorId(
  v: unknown
): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, value: null };
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (Number.isInteger(n) && n > 0 && n < 1_000_000_000) return { ok: true, value: n };
  return { ok: false };
}
