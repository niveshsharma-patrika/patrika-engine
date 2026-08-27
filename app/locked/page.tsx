import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { confinedFor } from "@/lib/auth/confined";
import { LockedNotice } from "@/components/locked-notice";

export const dynamic = "force-dynamic";

/** Locked landing — the middleware sends a confined user's non-section requests
 * here so they see a clear, section-aware locked message. */
export default async function LockedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const c = confinedFor(session.role);
  return <LockedNotice home={c?.home} labelEn={c?.labelEn} labelHi={c?.labelHi} />;
}
