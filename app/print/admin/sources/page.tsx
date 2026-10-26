import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintSources } from "@/components/print-sources";

export const dynamic = "force-dynamic";

/** Admin — the print desk's own per-city feeds. */
export default async function PrintSourcesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/print");
  return <PrintSources />;
}
