import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * News Inbox API.
 *   POST  — any signed-in user submits a news tip (headline + details + photos).
 *   GET   — admin only: the inbox, newest first, with submitter name.
 *   PATCH — admin only: flip a tip's status (new / reviewed / dismissed).
 *
 * Image handling mirrors the feedback API exactly: inline raster data-URLs
 * only (never SVG or arbitrary blobs), capped count + size so rows stay small.
 */
const CATEGORIES = [
  "crime", "politics", "civic", "business", "sports",
  "entertainment", "health", "education", "other",
] as const;

const MAX_ATTACHMENTS = 6;
const MAX_DATAURL_LEN = 2_900_000; // ~2 MB raw → ~2.75 MB base64
const RASTER_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const RASTER_DATAURL = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

const Attachment = z.object({
  name: z.string().max(200).default("image"),
  type: z.string().refine((t) => RASTER_TYPES.includes(t.toLowerCase()), "Only PNG/JPG/GIF/WebP images are allowed"),
  data: z
    .string()
    .max(MAX_DATAURL_LEN, "Image too large — keep each under ~2 MB")
    .refine((d) => RASTER_DATAURL.test(d), "Only PNG/JPG/GIF/WebP images are allowed"),
});

const Body = z.object({
  headline: z.string().trim().min(3, "Give it a short headline").max(300),
  details: z.string().trim().max(8000).default(""),
  location: z.string().trim().max(160).optional(),
  category: z.enum(CATEGORIES).default("other"),
  attachments: z.array(Attachment).max(MAX_ATTACHMENTS).default([]),
  // Anonymous (logged-out) submitters identify themselves here.
  name: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(160).optional(),
  // Honeypot — real users never see or fill this; bots do. Accepted by the
  // schema so we can silently drop it in the handler rather than 400 (which
  // would tell a bot it was detected).
  website: z.string().max(200).optional(),
});

/**
 * POST — submit a news tip.
 *
 * Public: works with OR without a session, so /submit can be a shareable,
 * standalone form. Signed-in submissions record submitter_id; anonymous ones
 * record the name/contact typed on the form.
 */
export async function POST(req: Request) {
  const session = await getSession();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { headline, details, location, category, attachments, name, contact, website } = parsed.data;

  // Honeypot tripped → silently accept (200) so bots don't learn, but store nothing.
  if (website) return Response.json({ ok: true });

  // Anonymous submitters must give a name so the desk knows who sent it.
  if (!session && !name) {
    return Response.json({ error: "Please add your name." }, { status: 400 });
  }

  try {
    await pool.query(
      `INSERT INTO news_submissions
         (submitter_id, submitter_name, submitter_contact, headline, details, location, category, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        session?.userId ?? null,
        session ? null : (name ?? null),
        session ? null : (contact ?? null),
        headline, details, location?.trim() || null, category, JSON.stringify(attachments),
      ]
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("news submission insert failed:", e);
    return Response.json({ error: "Could not save your submission." }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.headline, n.details, n.location, n.category, n.attachments,
              n.status, n.created_at, n.promoted_draft_id, n.promoted_at,
              COALESCE(p.full_name, n.submitter_name) AS submitter_name,
              n.submitter_contact,
              CASE WHEN n.submitter_id IS NULL THEN 'external' ELSE p.role END AS submitter_role
         FROM news_submissions n
         LEFT JOIN profiles p ON p.id = n.submitter_id
        ORDER BY n.created_at DESC
        LIMIT 500`
    );
    const { rows: counts } = await pool.query<{ status: string; n: string }>(
      `SELECT status, count(*)::text AS n FROM news_submissions GROUP BY status`
    );
    return Response.json({
      submissions: rows,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    });
  } catch (e) {
    console.error("news inbox list failed:", e);
    return Response.json({ error: "Could not load the inbox." }, { status: 500 });
  }
}

const Patch = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "reviewed", "dismissed"]),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  // Never override a 'promoted' row's status via this simple toggle.
  await pool.query(
    "UPDATE news_submissions SET status = $2 WHERE id = $1 AND status <> 'promoted'",
    [parsed.data.id, parsed.data.status]
  );
  return Response.json({ ok: true });
}
