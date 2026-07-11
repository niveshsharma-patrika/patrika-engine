import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, type Role, type Edition } from "@/lib/auth/jwt";
import { setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.email, email))
    .limit(1);
  const user = rows[0];

  // One generic error for unknown-user / bad-password / disabled (no leaking).
  if (!user || !user.passwordHash || !user.isActive) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email ?? email,
    name: user.fullName,
    role: user.role as Role,
    edition: (user.edition as Edition) ?? "digital",
  });
  await setSessionCookie(token);
  return Response.json({
    ok: true,
    user: { name: user.fullName, role: user.role, edition: user.edition },
  });
}
