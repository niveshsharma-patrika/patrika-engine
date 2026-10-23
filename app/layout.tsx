import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/context";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth/session";
import { confinedFor } from "@/lib/auth/confined";
import { resolveFeatureFlags, canAccessFeature } from "@/lib/feature-flags";
import { featureForPath } from "@/lib/features";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Patrika Kairos — News Engine",
  description:
    "Trends, suggestions, and AI-assisted drafting for the Patrika newsroom.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  // getSession re-checks the DB, so a still-valid cookie whose account was
  // removed or disabled resolves to null. The edge middleware only verifies the
  // JWT signature and can't tell — so it lets them through; we bounce them to
  // /login here. Unauthenticated users never reach a protected layout (middleware
  // already redirects them), so a null session on any non-login page means a
  // dead account. (x-pathname is set by the middleware; absent on /login.)
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!session && pathname && pathname !== "/login") {
    redirect("/login");
  }

  // Confined roles (print / olloi) may use only their one section. The edge
  // middleware enforces this on the (up-to-7-day-cached) JWT role; re-check the
  // LIVE role here so a just-demoted user is confined on their very next request.
  const confined = confinedFor(session?.role);
  if (confined && pathname && pathname !== "/login" && pathname !== "/locked" && !confined.isPage(pathname)) {
    redirect("/locked");
  }

  // Hard surface split by LIVE edition (both sides read getSession, so they can
  // never disagree → no redirect loop, and an edition change applies at once).
  // Print-edition users live only under /print/*; the print layout bounces
  // digital users the other way.
  const onPrintSurface = pathname === "/print" || pathname.startsWith("/print/");
  if (session && session.edition === "print" && !confined && pathname && pathname !== "/login" && !onPrintSurface) {
    redirect("/print");
  }

  // Feature visibility (Admin → Features): the sidebar is filtered by these, and
  // a disabled / role-restricted page is blocked on direct access. Enforcement is
  // scoped to the digital surface (print edition is already constrained by the
  // middleware), and the dashboard "/" is never blocked so there's no redirect
  // loop. Admins always keep the Features page (isProtected).
  const flags = session ? await resolveFeatureFlags() : null;
  if (session && !confined && pathname && pathname !== "/login") {
    const feature = featureForPath(pathname);
    const safeHome = session.edition === "print" ? "/print" : "/";
    if (feature && feature.href !== safeHome && !canAccessFeature(flags?.[feature.key], feature, session.role, session.edition)) {
      redirect(safeHome);
    }
  }

  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <LangProvider>
          <Shell edition={session?.edition ?? "digital"} role={session?.role ?? "writer"} flags={flags ?? undefined}>
            {children}
          </Shell>
        </LangProvider>
      </body>
    </html>
  );
}
