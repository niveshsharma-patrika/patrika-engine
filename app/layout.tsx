import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { LangProvider } from "@/lib/i18n/context";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth/session";

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

  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <LangProvider>
          <Shell edition={session?.edition ?? "digital"} role={session?.role ?? "writer"}>
            {children}
          </Shell>
        </LangProvider>
      </body>
    </html>
  );
}
