import { z } from "zod";

import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Feedback API.
 *   POST  — any signed-in user submits feedback (text + nature + image attachments).
 *   GET   — admin only: the full inbox, newest first, with submitter name/email.
 *   PATCH — admin only: flip a feedback item's status open <-> reviewed.
 *
 * Attachments are stored inline as image data-URLs; we accept ONLY image/* data
 * URLs (never arbitrary HTML/blobs) and cap count + size so the DB stays small.
 */
const CATEGORIES = ["bug", "feature", "content", "ui", "other"] as const;

// ~2 MB image => ~2.75 MB base64. Cap each, and the count, to bound the row.
const MAX_ATTACHMENTS = 3;
const MAX_DATAURL_LEN = 2_900_000;

// Raster formats only — NO image/svg+xml. SVG is an active-content image
// (can carry <script>/onload); excluding it keeps attachments inert wherever
// they're later rendered (defense-in-depth; the data-URL prefix is the gate).
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
  category: z.enum(CATEGORIES),
  message: z.string().trim().min(1, "Say a little about it").max(5000),
  attachments: z.array(Attachment).max(MAX_ATTACHMENTS).default([]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { category, message, attachments } = parsed.data;

  try {
    await pool.query(
      `INSERT INTO feedback (user_id, category, message, attachments)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [session.userId, category, message, JSON.stringify(attachments)]
    );
    return Response.json({ ok: true });
  } catch (e) {
    // Don't leak the raw pg error (e.g. "relation feedback does not exist").
    console.error("feedback insert failed:", e);
    return Response.json({ error: "Could not save feedback." }, { status: 500 });
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
      `SELECT f.id, f.category, f.message, f.attachments, f.status, f.created_at,
              p.full_name AS user_name, p.email AS user_email, p.role AS user_role
         FROM feedback f
         LEFT JOIN profiles p ON p.id = f.user_id
        ORDER BY f.created_at DESC
        LIMIT 500`
    );
    return Response.json({ feedback: rows });
  } catch (e) {
    // Distinct from the 403 above so the client can tell "not admin" from a
    // transient DB error and not hide the inbox permanently.
    console.error("feedback list failed:", e);
    return Response.json({ error: "Could not load feedback." }, { status: 500 });
  }
}

const Patch = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "reviewed"]),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
  }
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  await pool.query("UPDATE feedback SET status = $2 WHERE id = $1", [
    parsed.data.id,
    parsed.data.status,
  ]);
  return Response.json({ ok: true });
}
