import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { NewsInbox } from "@/components/news-inbox";

export const dynamic = "force-dynamic";

/** News Inbox — admin only (also enforced in middleware). */
export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <NewsInbox />;
}
