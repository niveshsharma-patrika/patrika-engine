import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { QuickBytes } from "@/components/quick-bytes";

export const dynamic = "force-dynamic";

/** Quick Bytes — a Patrika+ subsection: pick a category, browse current-affairs
 *  ideas, and turn one into a glanceable swipe story (headline + 3–5 cards)
 *  that publishes to WordPress. All signed-in digital users. */
export default async function QuickBytesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <QuickBytes />;
}
