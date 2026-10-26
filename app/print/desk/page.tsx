import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintDeskQueue } from "@/components/print-desk-queue";

export const dynamic = "force-dynamic";

/** Desk — the editors' queue of submitted print stories. Editor/admin only. */
export default async function PrintDeskPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "editor") redirect("/print");
  return <PrintDeskQueue me={session.userId} />;
}
