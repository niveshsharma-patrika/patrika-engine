import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { FeatureControls } from "@/components/feature-controls";

export const dynamic = "force-dynamic";

/** Admin-only control panel for feature visibility (role + edition + on/off). */
export default async function FeaturesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <FeatureControls />;
}
