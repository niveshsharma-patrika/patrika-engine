import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { CategoryMapping } from "@/components/category-mapping";

export const dynamic = "force-dynamic";

/** Admin → Category Mapping: CMS category slug per Patrika+ desk, sent as the
 *  `category` field when publishing (Quick Bytes now). Admin only. */
export default async function CategoryMappingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <CategoryMapping />;
}
