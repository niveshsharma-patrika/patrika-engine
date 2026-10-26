import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { TranslationLog } from "@/components/translation-log";

export const dynamic = "force-dynamic";

/** Admin-only log + settings for the Hindi → English translation API used by WordPress. */
export default async function TranslationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <TranslationLog />;
}
