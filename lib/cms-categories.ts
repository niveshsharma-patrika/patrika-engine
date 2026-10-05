import { pool } from "@/lib/db";

/**
 * CMS category slug per Patrika+ desk (table cms_category_slugs, edited in
 * Admin → Category Mapping). Sent as the `category` field when publishing.
 * Quick Bytes uses it now; Patrika+ will reuse the same mapping later.
 */

/** The CMS slug mapped to a desk, or null if none is set. */
export async function getCategorySlug(deskKey: string): Promise<string | null> {
  if (!deskKey) return null;
  try {
    const { rows } = await pool.query<{ slug: string }>(
      `SELECT slug FROM cms_category_slugs WHERE desk_key = $1 LIMIT 1`,
      [deskKey]
    );
    const s = rows[0]?.slug?.trim();
    return s ? s : null;
  } catch {
    return null; // table not migrated / DB blip → treat as unmapped
  }
}

/** All desk → slug mappings, for the Admin page. */
export async function getAllCategorySlugs(): Promise<Record<string, string>> {
  try {
    const { rows } = await pool.query<{ desk_key: string; slug: string }>(
      `SELECT desk_key, slug FROM cms_category_slugs`
    );
    const out: Record<string, string> = {};
    for (const r of rows) out[r.desk_key] = r.slug ?? "";
    return out;
  } catch {
    return {};
  }
}

/** Upsert a batch of desk → slug mappings. */
export async function setCategorySlugs(map: Record<string, string>): Promise<void> {
  for (const [deskKey, slug] of Object.entries(map)) {
    await pool.query(
      `INSERT INTO cms_category_slugs (desk_key, slug, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (desk_key) DO UPDATE SET slug = EXCLUDED.slug, updated_at = now()`,
      [deskKey, (slug ?? "").trim().slice(0, 100)]
    );
  }
}
