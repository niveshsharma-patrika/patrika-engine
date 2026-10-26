import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { WordPressPayloads } from "@/components/wordpress-payloads";

export const dynamic = "force-dynamic";

/** Admin-only audit log of every Patrika+ article payload sent to WordPress. */
export default async function WordPressPayloadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <WordPressPayloads />;
}
