import { eq } from "drizzle-orm";

import { db, schema } from "../lib/db";
import { hashPassword } from "../lib/auth/password";

/**
 * Bootstrap / reset an admin account. The password comes from the
 * ADMIN_PASSWORD env var so it never lands in shell history or source.
 *
 *   ADMIN_PASSWORD='…' npx tsx scripts/create-admin.ts \
 *     nivesh.sharma@in.patrika.com "Nivesh Sharma" admin
 */
async function main() {
  const [email, name, role = "admin"] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password) {
    console.error(
      'Usage: ADMIN_PASSWORD=<pw> npx tsx scripts/create-admin.ts <email> "<Full Name>" [role]'
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.email, email));

  if (existing.length) {
    await db
      .update(schema.profiles)
      .set({ passwordHash, fullName: name, role, isActive: true })
      .where(eq(schema.profiles.email, email));
    console.log(`✓ Updated existing user as ${role}: ${email}`);
  } else {
    await db
      .insert(schema.profiles)
      .values({ email, fullName: name, role, passwordHash, isActive: true });
    console.log(`✓ Created ${role}: ${email} (${name})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("create-admin failed:", e);
  process.exit(1);
});
