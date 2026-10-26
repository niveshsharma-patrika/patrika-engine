import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { ProductivityReport } from "@/components/productivity-report";

export const dynamic = "force-dynamic";

/**
 * Admin-only productivity report — who created which stories.
 * /admin/* is already admin-gated in middleware; this re-checks server-side.
 */
export default async function ProductivityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  return <ProductivityReport />;
}
