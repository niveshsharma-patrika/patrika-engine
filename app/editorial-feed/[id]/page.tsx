import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { EditorialArticle } from "@/components/editorial-article";

export const dynamic = "force-dynamic";

/** Article detail for one editorial-feed story. The date is carried as a query
 *  param from the list (the feed is keyed by date). All signed-in users. */
export default async function EditorialArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const { date } = await searchParams;
  return <EditorialArticle id={id} date={typeof date === "string" ? date : ""} />;
}
