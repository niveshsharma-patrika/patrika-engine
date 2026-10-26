import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { PrintShell } from "@/components/print-shell";

export const dynamic = "force-dynamic";

/** The print-desk surface. Only edition=print users live here (plus admins,
 *  who manage both surfaces); everyone else is sent to the digital app. Uses
 *  the LIVE edition from getSession() (not the JWT) so a flipped edition takes
 *  effect without re-login. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.edition !== "print" && session.role !== "admin") redirect("/");
  return <PrintShell role={session.role}>{children}</PrintShell>;
}
