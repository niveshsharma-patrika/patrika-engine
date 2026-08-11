import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { ContentGenerator } from "@/components/content-generator";

export const dynamic = "force-dynamic";

/** Content Generator — paste a headline / text, run the full research +
 * fact-check + language-correction pipeline, get an article. All signed-in
 * digital users (writers, editors, admins). */
export default async function ContentGeneratorPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ContentGenerator />;
}
