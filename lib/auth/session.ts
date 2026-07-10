import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifySessionToken,
  type Session,
} from "./jwt";

/**
 * Cookie helpers (server-only — uses next/headers). Token sign/verify lives in
 * ./jwt so the middleware can verify without pulling next/headers.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure cookies are only kept by browsers over HTTPS. Default to secure in
    // production, but allow COOKIE_SECURE=false to run over plain HTTP (e.g.
    // behind a raw IP:port before a domain + TLS is set up). Flip it back once
    // HTTPS is in place.
    secure:
      process.env.COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Read + verify the current session (server components / route handlers). */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
