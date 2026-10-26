import { getSession } from "@/lib/auth/session";
import { getPrintCities } from "@/lib/print/cities";

export const dynamic = "force-dynamic";

/** GET /api/print/cities — the active cities / editions (for selects). */
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const cities = await getPrintCities();
  return Response.json({ cities: cities.map((c) => ({ key: c.key, name_en: c.name_en, name_hi: c.name_hi, region: c.region })) });
}
