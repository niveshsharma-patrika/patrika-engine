import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "editor", "writer"];

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body?.fullName === "string") update.fullName = body.fullName.trim();
  if (typeof body?.desk === "string") update.desk = body.desk.trim() || null;
  if (ROLES.includes(body?.role)) update.role = body.role;
  if (body?.edition === "print" || body?.edition === "digital") update.edition = body.edition;
  if (typeof body?.isActive === "boolean") update.isActive = body.isActive;
  if (typeof body?.password === "string" && body.password.length >= 6) {
    update.passwordHash = await hashPassword(body.password);
  }

  // Lockout guard: an admin can't demote, switch to Print (loses admin nav),
  // or disable their own account.
  if (
    id === admin.userId &&
    ((update.role && update.role !== "admin") ||
      update.isActive === false ||
      update.edition === "print")
  ) {
    return Response.json(
      { error: "You can't change your own admin role or edition, or disable your own account." },
      { status: 400 }
    );
  }

  await db.update(schema.profiles).set(update).where(eq(schema.profiles.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (id === admin.userId) {
    return Response.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  await db.delete(schema.profiles).where(eq(schema.profiles.id, id));
  return Response.json({ ok: true });
}
