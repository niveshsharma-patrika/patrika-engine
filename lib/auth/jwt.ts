import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe session token logic (jose only — no next/headers), so the
 * middleware and server routes can both verify sessions.
 */
export const SESSION_COOKIE = "patrika_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Role = "admin" | "editor" | "writer";
export type Edition = "print" | "digital";
export type Session = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  edition: Edition;
};

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT({ email: s.email, name: s.name, role: s.role, edition: s.edition })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as Role) ?? "writer",
      edition: (payload.edition as Edition) ?? "digital",
    };
  } catch {
    return null;
  }
}
