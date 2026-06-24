"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Lightbulb,
  Rss,
  History,
  Type,
  Eye,
  ShieldCheck,
  Search,
  Languages,
  Activity,
} from "lucide-react";

import { useLang } from "@/lib/i18n/context";
import { IngestStatus } from "@/components/ingest-status";
import { LiveTicker } from "@/components/live-ticker";

const NAV: Array<{ href: string; icon: React.ReactNode; key: string }> = [
  { href: "/",                  icon: <LayoutGrid size={16} />,    key: "navDashboard" },
  { href: "/today",             icon: <CalendarDays size={16} />,  key: "navToday" },
  { href: "/suggestions",       icon: <Lightbulb size={16} />,     key: "navSuggestions" },
  { href: "/sources",           icon: <Rss size={16} />,           key: "navSources" },
  { href: "/sources/last-run",  icon: <History size={16} />,       key: "navLastRun" },
  { href: "/stats",             icon: <Activity size={16} />,      key: "navStats" },
  { href: "/style",             icon: <Type size={16} />,          key: "navStyle" },
  { href: "/watchlist",         icon: <Eye size={16} />,           key: "navWatchlist" },
  { href: "/admin",             icon: <ShieldCheck size={16} />,   key: "navAdmin" },
];

const NAV_BADGES: Record<string, string | undefined> = {
  "/watchlist": "42",
};

const SYSTEM_ROWS: Array<[string, string, "live" | "warn"]> = [
  ["Twitter / X", "—", "warn"],
  ["RSS feeds", "23", "live"],
  ["Google News", "phase 2", "warn"],
  ["Style module", "v2.4", "live"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();

  // Auth pages (login) render standalone — no masthead / sidebar chrome.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Masthead */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-6 py-3.5 bg-[var(--surface)] border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-11 h-11 grid place-items-center bg-[var(--red)] text-white font-bold text-[26px] rounded leading-none shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)] group-hover:bg-[var(--red-hover)] transition-colors">
            P
          </div>
          <div className="leading-tight">
            <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)] leading-none">
              {lang === "hi" ? "पत्रिका" : "Patrika"}
            </h1>
            <p className="text-[11px] text-[var(--text-3)] mt-1 tracking-wide uppercase font-medium">
              {lang === "hi" ? "न्यूज़ इंजन" : "News engine"}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <IngestStatus />

          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-white border border-[var(--border)] hover:border-[var(--border-2)] rounded px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)]"
            title="Toggle language"
          >
            <Languages size={13} />
            {lang === "en" ? "हिं" : "EN"}
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--text-3)]" />
            <input
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded text-[13px] px-3 py-1.5 pl-8 w-60 outline-none focus:border-[var(--blue)] focus:bg-white"
              placeholder={t("searchPlaceholder")}
            />
          </div>
        </div>
      </header>

      <LiveTicker label={lang === "hi" ? "ताज़ा" : "On the wire"} />

      {/* Layout */}
      <div className="grid grid-cols-[232px_1fr] min-h-[calc(100vh-96px)]">
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] py-4 flex flex-col gap-4">
          <div className="px-3">
            <ul className="space-y-0.5 list-none">
              {NAV.map((item) => {
                // Pick the longest matching href so /sources/last-run highlights
                // only "Last run" and not also "Sources".
                const candidates = NAV.filter((n) =>
                  n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
                );
                const bestMatch = candidates.reduce(
                  (longest, c) => (c.href.length > longest.href.length ? c : longest),
                  candidates[0] ?? { href: "" }
                );
                const isActive = bestMatch?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded text-[14px] transition-colors ${
                        isActive
                          ? "bg-[var(--red-soft)] text-[var(--red)] font-medium"
                          : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className={isActive ? "text-[var(--red)]" : "text-[var(--text-3)]"}>
                        {item.icon}
                      </span>
                      {t(item.key as Parameters<typeof t>[0])}
                      {NAV_BADGES[item.href] && (
                        <span
                          className={`ml-auto px-1.5 py-px font-mono text-[11px] font-semibold rounded-full ${
                            isActive
                              ? "bg-[var(--red)] text-white"
                              : "bg-[var(--text)] text-white"
                          }`}
                        >
                          {NAV_BADGES[item.href]}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="px-3">
            <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-medium mx-3 mb-2">
              {t("system")}
            </h4>
            <ul className="space-y-2 px-3 text-[13px] text-[var(--text-2)] list-none">
              {SYSTEM_ROWS.map(([name, count, state]) => (
                <li key={name} className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: state === "warn" ? "var(--amber)" : "var(--green)" }}
                  />
                  {name}
                  <span className="ml-auto font-mono text-[11px] text-[var(--text-3)]">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="p-7 pb-20 min-w-0">{children}</main>
      </div>
    </div>
  );
}
