import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LockedNotice } from "@/components/locked-notice";

export const dynamic = "force-dynamic";

/** Locked landing — the middleware rewrites a "print" user's non-generator page
 * requests here (URL preserved) so they see a clear locked message. */
export default async function LockedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <LockedNotice />;
}
