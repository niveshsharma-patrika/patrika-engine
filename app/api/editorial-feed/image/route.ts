import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Only Patrika-owned hosts may be proxied (SSRF guard). */
function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "patrika.com" || h.endsWith(".patrika.com");
}

/** GET /api/editorial-feed/image?u=<encoded url> — same-origin image proxy.
 *  The editorial feed serves images from http-only Patrika hosts, which an
 *  https page blocks as mixed content; proxying lets them load. Signed-in only,
 *  Patrika hosts only. */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });

  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if ((target.protocol !== "http:" && target.protocol !== "https:") || !allowedHost(target.hostname)) {
    return new Response("Host not allowed", { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "image/*" },
      cache: "no-store",
      // Do NOT follow redirects: the host allowlist only checks this URL, so a
      // 3xx to another host would bypass it (SSRF). A redirect is a non-ok
      // status here and is rejected below.
      redirect: "manual",
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return new Response("Upstream image unavailable", { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": type,
        // Cache at the browser/CDN — these assets are immutable per URL.
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
}
