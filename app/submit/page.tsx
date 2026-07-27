import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { NewsSubmitForm } from "@/components/news-submit-form";

export const dynamic = "force-dynamic";

/** News submission form — any signed-in user. The Inbox that receives these is admin-only. */
export default async function SubmitPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <NewsSubmitForm />;
}
