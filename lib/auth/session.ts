import { cookies } from "next/headers";

import { pool } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifySessionToken,
  type Session,
  type Role,
  type Edition,
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

/**
 * Read + verify the current session (server components / route handlers).
 *
 * The JWT is a 7-day cache of role/edition captured at login. So we re-check the
 * user's LIVE role, edition and active-status from the DB on every call — role
 * changes and account disables take effect on the next request, with no
 * re-login. A disabled/deleted user resolves to null (logged out). If the DB
 * lookup fails we fall back to the token so a blip doesn't lock everyone out.
 *
 * Note: the edge middleware still verifies the JWT directly (it can't reach the
 * DB), so it stays a coarse guard; this live check is the real boundary for
 * pages and API routes, which all go through getSession().
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  try {
    const { rows } = await pool.query(
      "SELECT role, edition, is_active, full_name FROM profiles WHERE id = $1 LIMIT 1",
      [session.userId]
    );
    const u = rows[0];
    if (!u || u.is_active === false) return null; // disabled or deleted → logged out
    return {
      ...session,
      role: (u.role as Role) ?? session.role,
      edition: (u.edition as Edition) ?? session.edition,
      name: u.full_name ?? session.name,
    };
  } catch {
    return session; // DB unreachable — trust the token rather than lock everyone out
  }
}
