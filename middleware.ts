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
      pathname === "/generated" ||
      pathname === "/feedback" ||
      pathname.startsWith("/today/") ||
      pathname.startsWith("/all-stories/") ||
      pathname.startsWith("/generated/") ||
      pathname.startsWith("/feedback/");
    if (!printOk) {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Role gate — admin-only / editor-only sections are enforced here (server-side)
  // so a hidden nav item can't be reached by typing the URL. APIs enforce their
  // own role checks. Editors keep Users (to add writers); writers lose the most.
  if (session.role !== "admin" && !pathname.startsWith("/api/")) {
    const sourcesBlocked =
      pathname === "/sources" ||
      (pathname.startsWith("/sources/") && !pathname.startsWith("/sources/last-run"));
    const blocked =
      session.role === "editor"
        ? pathname.startsWith("/admin") || pathname.startsWith("/directives") || sourcesBlocked
        : pathname.startsWith("/admin") ||
          pathname.startsWith("/directives") ||
          pathname.startsWith("/stats") ||
          pathname.startsWith("/style") ||
          sourcesBlocked;
    if (blocked) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Pass the path to server components. The root layout uses it to bounce
  // removed/disabled users whose cookie is still valid but whose live account
  // is gone (the edge check here only verifies the JWT signature, not the DB).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
