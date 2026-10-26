"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Flame, MapPin, Newspaper, Lightbulb, Telescope, PenSquare, FileText,
  Inbox, Rss, Map as MapIcon, ScrollText, Languages, LogOut, Monitor,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import type { Role } from "@/lib/auth/jwt";

type Item = { href: string; icon: React.ReactNode; en: string; hi: string; min?: "editor" | "admin" };
type Group = { en: string; hi: string; items: Item[] };

const GROUPS: Group[] = [
  {
    en: "Find stories", hi: "स्टोरी खोजें",
    items: [
      { href: "/print",             icon: <LayoutDashboard size={16} />, en: "Dashboard",   hi: "डैशबोर्ड" },
      { href: "/print/national",    icon: <Flame size={16} />,           en: "National",    hi: "राष्ट्रीय" },
      { href: "/print/local",       icon: <MapPin size={16} />,          en: "Local",       hi: "लोकल" },
      { href: "/print/all-stories", icon: <Newspaper size={16} />,       en: "All Stories", hi: "सभी स्टोरीज़" },
      { href: "/print/suggestions", icon: <Lightbulb size={16} />,       en: "Suggestions", hi: "सुझाव" },
      { href: "/print/research",    icon: <Telescope size={16} />,       en: "Research",    hi: "रिसर्च" },
    ],
  },
  {
    en: "Write", hi: "लिखें",
    items: [
      { href: "/print/write",  icon: <PenSquare size={16} />, en: "Write",     hi: "लिखें" },
      { href: "/print/drafts", icon: <FileText size={16} />,  en: "My Drafts", hi: "मेरे ड्राफ़्ट" },
      { href: "/print/desk",   icon: <Inbox size={16} />,     en: "Desk",      hi: "डेस्क", min: "editor" },
    ],
  },
  {
    en: "Admin", hi: "एडमिन",
    items: [
      { href: "/print/admin/sources",   icon: <Rss size={16} />,        en: "Print sources", hi: "प्रिंट सोर्स", min: "admin" },
      { href: "/print/admin/cities",    icon: <MapIcon size={16} />,        en: "Cities",        hi: "शहर",         min: "admin" },
      { href: "/print/admin/directive", icon: <ScrollText size={16} />, en: "Directive",     hi: "निर्देश",      min: "admin" },
    ],
  },
];

const canSee = (role: Role, min?: Item["min"]) =>
  !min || role === "admin" || (min === "editor" && role === "editor");

/** The print-desk surface shell — its own masthead + grouped nav, separate from
 *  the digital app. Rendered for edition=print users only; desk/admin items
 *  show by role (the pages enforce it too). */
export function PrintShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang } = useLang();
  const hi = lang === "hi";

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-6 py-3.5 bg-[var(--surface)] border-b border-[var(--border)]">
        <Link href="/print" className="flex items-center gap-2.5">
          <div className="leading-tight">
            <h1 className="text-[20px] tracking-tight leading-none">
              <span className="font-medium text-[var(--text-2)]">{hi ? "पत्रिका " : "Patrika "}</span>
              <span className="font-bold text-[var(--red)]">{hi ? "प्रिंट डेस्क" : "Print Desk"}</span>
            </h1>
            <p className="text-[10px] text-[var(--text-3)] mt-1.5 tracking-[0.2em] uppercase font-semibold">
              {hi ? "न्यूज़रूम" : "Newsroom"}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {role === "admin" && (
            <Link href="/"
              className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-white border border-[var(--border)] rounded px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)]">
              <Monitor size={13} /> {hi ? "डिजिटल डेस्क" : "Digital Desk"}
            </Link>
          )}
          <button onClick={() => setLang(hi ? "en" : "hi")}
            className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-white border border-[var(--border)] rounded px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)]">
            <Languages size={13} /> {hi ? "EN" : "हिं"}
          </button>
          <button onClick={signOut}
            className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-white border border-[var(--border)] rounded px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)]">
            <LogOut size={13} /> {hi ? "साइन आउट" : "Sign out"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[232px_1fr] min-h-[calc(100vh-61px)]">
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] py-4">
          {GROUPS.map((g) => {
            const items = g.items.filter((it) => canSee(role, it.min));
            if (items.length === 0) return null;
            return (
              <div key={g.en} className="px-3 mb-4">
                <div className="px-3 mb-1 text-[10.5px] font-semibold tracking-[0.12em] uppercase text-[var(--text-3)]">{hi ? g.hi : g.en}</div>
                <ul className="space-y-0.5 list-none">
                  {items.map((item) => {
                    const isActive = item.href === "/print" ? pathname === "/print" : pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <Link href={item.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded text-[14px] transition-colors ${
                            isActive ? "bg-[var(--red-soft)] text-[var(--red)] font-medium" : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                          }`}>
                          <span className={isActive ? "text-[var(--red)]" : "text-[var(--text-3)]"}>{item.icon}</span>
                          {hi ? item.hi : item.en}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
