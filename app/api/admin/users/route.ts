import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "desk_head", "sub_editor", "reporter"];

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await db
    .select({
      id: schema.profiles.id,
      email: schema.profiles.email,
      fullName: schema.profiles.fullName,
      role: schema.profiles.role,
      desk: schema.profiles.desk,
      isActive: schema.profiles.isActive,
      createdAt: schema.profiles.createdAt,
    })
    .from(schema.profiles)
    .orderBy(desc(schema.profiles.createdAt));
  return Response.json({ users });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const fullName = (body?.fullName ?? "").toString().trim();
  const role = ROLES.includes(body?.role) ? body.role : "reporter";
  const password = (body?.password ?? "").toString();
  const desk = body?.desk ? body.desk.toString().trim() : null;

  if (!email || !fullName || password.length < 6) {
    return Response.json(
      { error: "Name, email, and a password (min 6 characters) are required." },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.email, email));
  if (existing.length) {
    return Response.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(schema.profiles)
    .values({ email, fullName, role, desk, passwordHash, isActive: true })
    .returning({
      id: schema.profiles.id,
      email: schema.profiles.email,
      fullName: schema.profiles.fullName,
      role: schema.profiles.role,
    });
  return Response.json({ user });
}
