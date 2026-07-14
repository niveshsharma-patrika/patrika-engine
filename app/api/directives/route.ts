import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import {
  DIRECTIVE_CONTROLS,
  DEFAULT_DIRECTIVES,
  loadDirectiveOverrides,
} from "@/lib/ai/directives";

export const dynamic = "force-dynamic";

/**
 * GET  /api/directives — every control + option with its effective directive
 *                        (editor override if any, else built-in default).
 * PUT  /api/directives — { updates: [{control, value, directive}] }. Blank or
 *                        default-equal text deletes the override (reset). Admin
 *                        / desk_head only.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const overrides = await loadDirectiveOverrides();
  const controls = DIRECTIVE_CONTROLS.map((c) => ({
    key: c.key,
    label: c.label,
    options: c.options.map((value) => {
      const def = DEFAULT_DIRECTIVES[c.key]?.[value] ?? "";
      const override = overrides[c.key]?.[value];
      return {
        value,
        default: def,
        directive: override ?? def,
        customized: override != null && override !== def,
      };
    }),
  }));
  return Response.json({ controls });
}

type Update = { control: string; value: string; directive: string };

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const json = (await req.json().catch(() => null)) as { updates?: Update[] } | null;
  const updates = Array.isArray(json?.updates) ? json.updates : [];
  if (updates.length === 0) return Response.json({ ok: true, changed: 0 });

  // Only accept control/option pairs we know about — never store arbitrary keys.
  const known = new Map(DIRECTIVE_CONTROLS.map((c) => [c.key, new Set(c.options)]));

  let changed = 0;
  for (const u of updates) {
    if (!u || typeof u.control !== "string" || typeof u.value !== "string") continue;
    const opts = known.get(u.control);
    if (!opts || !opts.has(u.value)) continue;

    const text = typeof u.directive === "string" ? u.directive.trim() : "";
    const def = DEFAULT_DIRECTIVES[u.control]?.[u.value] ?? "";

    if (text === "" || text === def) {
      // Reset to the built-in default — drop any override row.
      await pool.query(
        "DELETE FROM writing_directives WHERE control = $1 AND option_value = $2",
        [u.control, u.value]
      );
    } else {
      await pool.query(
        `INSERT INTO writing_directives (control, option_value, directive, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (control, option_value)
         DO UPDATE SET directive = EXCLUDED.directive, updated_at = now()`,
        [u.control, u.value, text]
      );
    }
    changed++;
  }
  return Response.json({ ok: true, changed });
}
