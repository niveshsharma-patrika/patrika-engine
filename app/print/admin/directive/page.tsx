import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintDirective } from "@/components/print-directive";

export const dynamic = "force-dynamic";

/** Admin — the print house-style directive applied to every AI-written story. */
export default async function PrintDirectivePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/print");
  return <PrintDirective />;
}
