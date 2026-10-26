import { pool } from "@/lib/db";

/** Small key/value settings for the print desk (e.g. the Hindi print directive). */
export async function getPrintSetting(key: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ value: string }>(`SELECT value FROM print_settings WHERE key = $1`, [key]);
    return rows[0]?.value ?? "";
  } catch {
    return "";
  }
}

export async function setPrintSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO print_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}
