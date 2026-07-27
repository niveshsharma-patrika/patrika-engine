import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Self-contained challenge captcha for the public /submit form.
 *
 * No external service, no signup, no DB state: the server issues a simple
 * arithmetic question plus an HMAC-signed token that commits to the answer
 * WITHOUT revealing it. On submit, the server recomputes the HMAC from the
 * typed answer — only the correct answer reproduces the signature.
 *
 * This stops naive spam bots (and, with the honeypot, most drive-by abuse). It
 * is deliberately lightweight; for a stronger free layer, Cloudflare Turnstile
 * can be dropped in later. The token expires so a solved challenge can't be
 * replayed indefinitely.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes

function secret(): string {
  return (
    process.env.KEY_ENCRYPTION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.AUTH_SECRET ||
    "patrika-captcha-fallback"
  );
}

function sign(answer: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${answer}.${exp}`).digest("hex");
}

export type Challenge = { question: string; token: string };

/** Issue a fresh arithmetic challenge. */
export function issueChallenge(): Challenge {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = String(a + b);
  const exp = Date.now() + TTL_MS;
  // token carries only the expiry + signature; the answer is NOT in it.
  return { question: `${a} + ${b} = ?`, token: `${exp}.${sign(answer, exp)}` };
}

/** Verify a submitted answer against its token. */
export function verifyChallenge(token: string | undefined, answer: string | undefined): boolean {
  if (!token || answer == null) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!expStr || !sig || !Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = sign(String(answer).trim(), exp);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
