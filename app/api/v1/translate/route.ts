import { after } from "next/server";
import { z } from "zod";

import { checkApiKey, getTranslationCallbackUrl, resolveCallbackUrl } from "@/lib/translate/config";
import { createJob, processJob, recentJobCount } from "@/lib/translate/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RATE_PER_MINUTE = 60;

const Body = z.object({
  id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(100)),
  title: z.string().trim().min(1).max(500),
  excerpt: z.string().max(3000).optional().default(""),
  content: z.string().min(1).max(150_000),
  callback_url: z.string().max(1000).optional(),
});

/**
 * POST /api/v1/translate — WordPress sends a Hindi article (X-API-Key auth);
 * we reply 202 at once and POST the English translation to the callback URL
 * when it's ready (20–60 s). See deploy/TRANSLATION_API.md.
 */
export async function POST(req: Request) {
  if (!(await checkApiKey(req.headers.get("x-api-key")))) {
    return Response.json({ error: "Invalid or missing X-API-Key." }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `Invalid body: ${issue?.path.join(".") || "body"} — ${issue?.message ?? "bad value"}` }, { status: 400 });
  }
  const { id, title, excerpt, content, callback_url } = parsed.data;

  const callbackUrl = resolveCallbackUrl(callback_url ?? null, await getTranslationCallbackUrl());
  if (!callbackUrl) {
    return Response.json(
      { error: callback_url ? "callback_url must be https and on the same site as the configured callback URL." : "No callback URL is configured on our side yet." },
      { status: 400 }
    );
  }

  if ((await recentJobCount()) >= RATE_PER_MINUTE) {
    return Response.json({ error: "Too many requests — retry in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const job = await createJob(id, callbackUrl, { title, excerpt, content });
    if (!job.duplicate) after(() => processJob(job.id).catch((e) => console.error("[translate] job failed", job.id, e)));
    return Response.json(
      { job_id: job.id, id, status: "queued", duplicate: job.duplicate, status_url: `/api/v1/translate/${job.id}` },
      { status: 202 }
    );
  } catch (err) {
    console.error("[translate] could not queue", err);
    return Response.json({ error: "Could not queue the translation — please retry." }, { status: 500 });
  }
}
