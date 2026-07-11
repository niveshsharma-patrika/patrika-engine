import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/jwt";

/**
 * Native auth gate (replaces the old Supabase session refresh). Every request
 * needs a valid session cookie, except:
 *   • /login + the auth APIs (so you can sign in)
 *   • /api/cron/* (authenticates with CRON_SECRET, not a user session)
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/cron") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Print-edition users get a reduced surface — only Trends today + All Stories
  // (plus the APIs their pages call). Any other page redirects to /today.
  if (session.edition === "print" && !pathname.startsWith("/api/")) {
    const printOk =
      pathname === "/today" ||
      pathname === "/all-stories" ||
      pathname.startsWith("/today/") ||
      pathname.startsWith("/all-stories/");
    if (!printOk) {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
