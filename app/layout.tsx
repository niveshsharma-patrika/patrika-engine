import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
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
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <LangProvider>
          <Shell edition={session?.edition ?? "digital"}>{children}</Shell>
        </LangProvider>
      </body>
    </html>
  );
}
