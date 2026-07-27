import { getSession } from "@/lib/auth/session";
import { NewsSubmitForm } from "@/components/news-submit-form";

export const dynamic = "force-dynamic";

/**
 * Public, standalone news-tip form — shareable to reporters/stringers/public
 * who may have no Kairos login. Renders with no app chrome (see Shell).
 * Signed-in visitors submit as themselves; everyone else adds a name.
 */
export default async function SubmitPage() {
  const session = await getSession();
  return <NewsSubmitForm signedIn={!!session} />;
}
