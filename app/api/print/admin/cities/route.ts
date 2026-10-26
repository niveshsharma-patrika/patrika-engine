import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getAllPrintCities, cityKey, createCityFeeds } from "@/lib/print/cities";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

/** GET — every city / edition, incl. inactive. */
export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ cities: await getAllPrintCities() });
}

/** POST — add a city; its two Google News local feeds are created too.
 *  Body: { name_en, name_hi, region?: rajasthan|metro } */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const nameEn = typeof body?.name_en === "string" ? body.name_en.trim().slice(0, 80) : "";
  const nameHi = typeof body?.name_hi === "string" ? body.name_hi.trim().slice(0, 80) : "";
  const region = body?.region === "metro" ? "metro" : "rajasthan";
  if (!nameEn || !nameHi) return Response.json({ error: "Need English + Hindi names" }, { status: 400 });
  const key = cityKey(nameEn);
  if (!key) return Response.json({ error: "Bad name" }, { status: 400 });
  try {
    await pool.query(
      `INSERT INTO print_cities (key, name_en, name_hi, region, sort)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort), 0) + 1 FROM print_cities))
       ON CONFLICT (key) DO UPDATE SET name_en = EXCLUDED.name_en, name_hi = EXCLUDED.name_hi, active = true`,
      [key, nameEn, nameHi, region]
    );
    await createCityFeeds(key, nameEn, nameHi);
    return Response.json({ ok: true, key });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/** PATCH — toggle a city (and its print feeds). Body: { key, active } */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  const active = Boolean(body?.active);
  try {
    await pool.query(`UPDATE print_cities SET active = $2 WHERE key = $1`, [key, active]);
    await pool.query(`UPDATE sources SET is_active = $2 WHERE scope = 'print' AND city = $1`, [key, active]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
