import { pool } from "@/lib/db";

/**
 * CMS category slugs per Patrika+ desk (table cms_category_slugs, edited in
 * Admin → Category Mapping). Each desk maps to TWO WordPress category slugs:
 *   - slug    : the Patrika GLOBAL/topical category (e.g. politics-news).
 *   - ppSlug  : the Patrika PLUS category for the desk (e.g. satta-ki-zameen).
 * Quick Bytes sends just the desk's global slug. Patrika+ sends BOTH, as a
 * category array [ppSlug, slug]. Blank slugs are omitted.
 */

export type DeskCategories = { slug: string; ppSlug: string };

/** The global/topical CMS slug for a desk, or null if none is set.
 *  Used by Quick Bytes (single category) and as one of Patrika+'s two. */
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

/** Both category slugs for a desk — the Patrika Plus category + the global
 *  category. Missing/unmapped desks return empty strings. */
export async function getDeskCategories(deskKey: string): Promise<DeskCategories> {
  if (!deskKey) return { slug: "", ppSlug: "" };
  try {
    const { rows } = await pool.query<{ slug: string; pp_slug: string }>(
      `SELECT slug, pp_slug FROM cms_category_slugs WHERE desk_key = $1 LIMIT 1`,
      [deskKey]
    );
    return {
      slug: (rows[0]?.slug ?? "").trim(),
      ppSlug: (rows[0]?.pp_slug ?? "").trim(),
    };
  } catch {
    return { slug: "", ppSlug: "" };
  }
}

/** All desk → {slug, ppSlug} mappings, for the Admin page. */
export async function getAllCategorySlugs(): Promise<Record<string, DeskCategories>> {
  try {
    const { rows } = await pool.query<{ desk_key: string; slug: string; pp_slug: string }>(
      `SELECT desk_key, slug, pp_slug FROM cms_category_slugs`
    );
    const out: Record<string, DeskCategories> = {};
    for (const r of rows) out[r.desk_key] = { slug: r.slug ?? "", ppSlug: r.pp_slug ?? "" };
    return out;
  } catch {
    return {};
  }
}

/** Upsert a batch of desk → {slug, ppSlug} mappings. */
export async function setCategorySlugs(map: Record<string, DeskCategories>): Promise<void> {
  for (const [deskKey, v] of Object.entries(map)) {
    await pool.query(
      `INSERT INTO cms_category_slugs (desk_key, slug, pp_slug, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (desk_key) DO UPDATE SET slug = EXCLUDED.slug, pp_slug = EXCLUDED.pp_slug, updated_at = now()`,
      [deskKey, (v.slug ?? "").trim().slice(0, 100), (v.ppSlug ?? "").trim().slice(0, 100)]
    );
  }
}
