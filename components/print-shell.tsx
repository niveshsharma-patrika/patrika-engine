"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Telescope, PenSquare, FileText, Languages, LogOut } from "lucide-react";

import { useLang } from "@/lib/i18n/context";

type Item = { href: string; icon: React.ReactNode; en: string; hi: string };

const NAV: Item[] = [
  { href: "/print",          icon: <Newspaper size={16} />,  en: "Stories",   hi: "स्टोरीज़" },
  { href: "/print/research", icon: <Telescope size={16} />,  en: "Research",  hi: "रिसर्च" },
  { href: "/print/write",    icon: <PenSquare size={16} />,  en: "Write",     hi: "लिखें" },
  { href: "/print/drafts",   icon: <FileText size={16} />,   en: "My Drafts", hi: "मेरे ड्राफ़्ट" },
];

/** The print-desk surface shell — its own masthead + nav, separate from the
 *  digital app. Rendered for edition=print users only. */
export function PrintShell({ children }: { children: React.ReactNode }) {
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
              {hi ? "संपादकीय" : "Newsroom"}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
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
          <div className="px-3">
            <ul className="space-y-0.5 list-none">
              {NAV.map((item) => {
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
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
