import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { SocialCenter } from "@/components/social-center";

export const dynamic = "force-dynamic";

/** Social command center — editors + admins (writers blocked in middleware). */
export default async function SocialPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "editor") redirect("/");
  return <SocialCenter />;
}
