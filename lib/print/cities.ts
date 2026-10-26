import { cache } from "react";

import { pool } from "@/lib/db";

/** A city / edition the print desk covers (table print_cities, bilingual). */
export type PrintCity = { key: string; name_en: string; name_hi: string; region: string; active: boolean; sort: number };

/** Active cities in display order (request-cached). */
export const getPrintCities = cache(async (): Promise<PrintCity[]> => {
  try {
    const { rows } = await pool.query<PrintCity>(
      `SELECT key, name_en, name_hi, region, active, sort FROM print_cities WHERE active ORDER BY region, sort, name_en`
    );
    return rows;
  } catch {
    return []; // table not migrated yet
  }
});

/** Every city incl. inactive (admin). */
export async function getAllPrintCities(): Promise<PrintCity[]> {
  try {
    const { rows } = await pool.query<PrintCity>(
      `SELECT key, name_en, name_hi, region, active, sort FROM print_cities ORDER BY region, sort, name_en`
    );
    return rows;
  } catch {
    return [];
  }
}

export function cityKey(nameEn: string): string {
  return nameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Google News per-city feed URLs (aggregate many publications per query).
 *  English uses the exact city name ("Jaipur" when:1d) so the URL never
 *  collides with the digital desk's "<City> news" feeds (sources.url is UNIQUE);
 *  must stay in sync with deploy/print-desk.sql. */
export function cityFeedUrl(nameEn: string, nameHi: string, language: "hi" | "en"): string {
  return language === "hi"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(`${nameHi} समाचार when:1d`)}&hl=hi-IN&gl=IN&ceid=IN:hi`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(`"${nameEn}" when:1d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/** Create the two Google News local feeds for a city (idempotent on url; a
 *  re-added city's existing print feeds are switched back on). */
export async function createCityFeeds(key: string, nameEn: string, nameHi: string): Promise<void> {
  for (const lang of ["hi", "en"] as const) {
    await pool.query(
      `INSERT INTO sources (name, source_type, url, language, desk, focus, is_active, scope, city)
       VALUES ($1, 'google_news', $2, $3, $4, 'regional', true, 'print', $5)
       ON CONFLICT (url) DO UPDATE SET is_active = true WHERE sources.scope = 'print'`,
      [`Local · ${nameEn} (${lang === "hi" ? "हिंदी" : "English"})`, cityFeedUrl(nameEn, nameHi, lang), lang, `Local · ${nameEn}`, key]
    );
  }
}
