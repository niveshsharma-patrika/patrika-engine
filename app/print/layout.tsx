import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintShell } from "@/components/print-shell";

export const dynamic = "force-dynamic";

/** The print-desk surface. Only edition=print users live here; everyone else is
 *  sent to the digital app (the middleware enforces the split too). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.edition !== "print") redirect("/");
  return <PrintShell>{children}</PrintShell>;
}
