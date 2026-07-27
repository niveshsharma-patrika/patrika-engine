import { issueChallenge } from "@/lib/captcha";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/captcha — issue a fresh challenge for the public submit form.
 * Public (under /api/news, which the middleware allows). Returns only a
 * question + signed token; the answer never leaves the server.
 */
export async function GET() {
  return Response.json(issueChallenge(), {
    headers: { "Cache-Control": "no-store" },
  });
}
