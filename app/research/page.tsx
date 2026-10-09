import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { Research } from "@/components/research";

export const dynamic = "force-dynamic";

/** Research — a writer describes an incident, we search the web and show what we
 *  found, then generate a grounded article on request. All signed-in users. */
export default async function ResearchPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <Research />;
}
