import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { HoroscopeView } from "@/components/horoscope";

export const dynamic = "force-dynamic";

/** Horoscopes — the day's rashifal for all 12 signs, generated nightly by the
 *  cron and auto-pushed to WordPress. All signed-in digital users; admins get
 *  manual regenerate / re-push controls. */
export default async function HoroscopePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <HoroscopeView isAdmin={session.role === "admin"} />;
}
