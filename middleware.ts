import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/jwt";
import { confinedFor } from "@/lib/auth/confined";

/**
 * Native auth gate (replaces the old Supabase session refresh). Every request
 * needs a valid session cookie, except:
 *   • /login + the auth APIs (so you can sign in)
 *   • /api/cron/* (authenticates with CRON_SECRET, not a user session)
 */
const PUBLIC_PATHS = [
  "/login", "/api/auth/login", "/api/auth/logout",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Cron endpoints are secret-gated at the route and must stay reachable by the
  // session-less runner — but a signed-in confined user (print / olloi, locked to
  // one section) must never reach them.
  if (pathname.startsWith("/api/cron")) {
    if (confinedFor(session?.role)) {
      return NextResponse.json(
        { error: "This account is restricted to its own section." },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Confined single-section roles (print → Content Generator, olloi → Olloi
  // Content). Handle fully here and return, so the edition/role checks below
  // never apply. Their one section's pages + APIs are allowed; every other page
  // redirects to /locked and every other API gets a 403.
  const confined = confinedFor(session.role);
  if (confined) {
    if (pathname.startsWith("/api/")) {
      if (!confined.isApi(pathname)) {
        return NextResponse.json(
          { error: "This account is restricted to its own section." },
          { status: 403 }
        );
      }
      return NextResponse.next();
    }
    if (!(confined.isPage(pathname) || pathname === "/locked")) {
      const url = request.nextUrl.clone();
      url.pathname = "/locked";
      url.search = "";
      return NextResponse.redirect(url);
    }
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
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
        ? pathname.startsWith("/admin") ||
          pathname.startsWith("/directives") ||
          // Stats + Style module are admin-only (hidden from editors and writers).
          pathname.startsWith("/stats") ||
          pathname.startsWith("/style") ||
          sourcesBlocked
        : pathname.startsWith("/admin") ||
          pathname.startsWith("/directives") ||
          pathname.startsWith("/stats") ||
          pathname.startsWith("/style") ||
          // Twitter monitoring + Social center are for editors + admins only.
          pathname.startsWith("/twitter") ||
          pathname.startsWith("/social") ||
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
