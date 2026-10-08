import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { DATE_RE } from "@/lib/editorial-feed";
import { EditorialFeed } from "@/components/editorial-feed";

export const dynamic = "force-dynamic";

/** Today's date (YYYY-MM-DD) in the newsroom's timezone, so a fresh visit lands
 *  on the current editorial day regardless of server/user timezone. */
function newsroomToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Editorial feed viewer — a standalone, read-only browser over the
 *  editorialreview.patrika.com JSON feed (list + filters). Not wired to
 *  publishing or anything else. All signed-in users. The day is seeded from
 *  ?date= on the server so returning from an article restores it with no flash. */
export default async function EditorialFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { date } = await searchParams;
  const initialDate = typeof date === "string" && DATE_RE.test(date) ? date : newsroomToday();
  return <EditorialFeed initialDate={initialDate} />;
}
