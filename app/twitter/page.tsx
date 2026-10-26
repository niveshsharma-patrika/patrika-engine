import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { TwitterConsole } from "@/components/twitter-console";

export const dynamic = "force-dynamic";

/**
 * Twitter/X monitoring — editors and admins only (writers never see it; also
 * enforced in middleware.ts so the URL can't be typed in).
 *
 * This whole section is isolated from the news pipeline: it reads only the
 * twitter_* tables and cannot affect signals, trends or drafts.
 */
export default async function TwitterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "editor") redirect("/");

  return <TwitterConsole isAdmin={session.role === "admin"} />;
}
