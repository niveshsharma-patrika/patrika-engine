"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  CalendarDays,
  Lightbulb,
  Rss,
  History,
  FileText,
  Type,
  SlidersHorizontal,
  ShieldCheck,
  Search,
  Languages,
  Activity,
  Users,
  BarChart3,
  TrendingUp,
  Newspaper,
  FileStack,
  Telescope,
  ScrollText,
  BookOpen,
  MessageSquare,
  AtSign,
  Wand2,
  Ribbon,
  Moon,
  Zap,
  Tags,
  ToggleLeft,
  Lock,
  LogOut,
} from "lucide-react";

import type { Edition, Role } from "@/lib/auth/jwt";
import { FEATURES, featureForPath, canAccessFeature } from "@/lib/features";
import { confinedFor } from "@/lib/auth/confined";
import { useLang } from "@/lib/i18n/context";
import { IngestStatus } from "@/components/ingest-status";
import { LiveTicker } from "@/components/live-ticker";
import { KairosMark } from "@/components/kairos-logo";

// Icon per feature key. The feature metadata (href, default roles/editions)
// lives in lib/features.ts so the server (layout gate + admin page) shares it;
// visibility is resolved from the DB flags passed in as `flags`.
const ICONS: Record<string, React.ReactNode> = {
  navDashboard: <LayoutGrid size={16} />,
  navToday: <CalendarDays size={16} />,
  navAllStories: <Newspaper size={16} />,
  navEditorialFeed: <FileStack size={16} />,
  navResearch: <Telescope size={16} />,
  navGenerated: <FileText size={16} />,
  navSuggestions: <Lightbulb size={16} />,
  navSources: <Rss size={16} />,
  navLastRun: <History size={16} />,
  navStats: <Activity size={16} />,
  navStyle: <Type size={16} />,
  navDirectives: <SlidersHorizontal size={16} />,
  navMagazines: <BookOpen size={16} />,
  navQuickBytes: <Zap size={16} />,
  navContentGenerator: <Wand2 size={16} />,
  navOlloi: <Ribbon size={16} />,
  navHoroscope: <Moon size={16} />,
  navTwitter: <AtSign size={16} />,
  navSocial: <TrendingUp size={16} />,
  navFeedback: <MessageSquare size={16} />,
  navAdmin: <ShieldCheck size={16} />,
  navUsers: <Users size={16} />,
  navProductivity: <BarChart3 size={16} />,
  navCategoryMapping: <Tags size={16} />,
  navWpPayloads: <ScrollText size={16} />,
  navFeatures: <ToggleLeft size={16} />,
};

/** DB-resolved visibility flags, passed from the server layout. */
type Flags = Record<string, { enabled: boolean; roles: string[]; editions: string[] }>;

const NAV_BADGES: Record<string, string | undefined> = {};

const SYSTEM_ROWS: Array<[string, string, "live" | "warn"]> = [
  ["Twitter / X", "—", "warn"],
  ["RSS feeds", "23", "live"],
  ["Google News", "phase 2", "warn"],
  ["Style module", "v2.4", "live"],
];

export function Shell({ children, edition, role, flags }: { children: React.ReactNode; edition: Edition; role: Role; flags?: Flags }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  // A confined user (print / olloi) sees the standard (non-admin) tabs but every
  // one except their own section is locked — shown with a lock icon and taken to
  // the locked screen on click. Edition doesn't gate them.
  const confined = confinedFor(role);
  // Visibility comes from the DB-resolved flags (Admin → Features). Confined
  // users see the confined-visible tabs that are still enabled; everyone else
  // sees features their role + edition is allowed and that are enabled. The
  // Features page (isProtected) always shows for admins.
  const nav = FEATURES.filter((f) => {
    const fl = flags?.[f.key];
    // Confined users keep their own home link even if the feature is disabled,
    // so they're never left with a sidebar of only locked rows.
    if (confined) return f.confinedVisible && (f.href === confined.home || (fl?.enabled ?? true));
    if (f.isProtected) return role === "admin";
    if (!fl) return false;
    return fl.enabled && fl.roles.includes(role) && fl.editions.includes(edition);
  }).map((f) => ({ href: f.href, key: f.key, icon: ICONS[f.key] }));

  // Client-side backstop for soft navigation. Client-component pages have no
  // server render on in-app navigation, so the server guard can't run for them;
  // the sidebar re-renders on nav (usePathname), so enforce flag visibility here
  // too. The server layout + per-page guards remain the real gate (hard loads,
  // typed URLs, and all server pages). Confined roles use their own mechanism.
  useEffect(() => {
    if (confined || !flags) return;
    const f = featureForPath(pathname);
    if (!f) return;
    const home = edition === "print" ? "/print" : "/";
    if (f.href === home) return;
    if (!canAccessFeature(flags[f.key], f, role, edition)) router.replace(home);
  }, [pathname, flags, role, edition, confined, router]);

  // Standalone surfaces render with no digital chrome: the login page, and the
  // dedicated print desk (which supplies its own shell via app/print/layout).
  if (pathname === "/login" || pathname === "/print" || pathname.startsWith("/print/")) {
    return <>{children}</>;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Masthead */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-6 py-3.5 bg-[var(--surface)] border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-3 group">
          <KairosMark size={44} />
          <div className="leading-tight">
            <h1 className="text-[21px] tracking-tight text-[var(--text)] leading-none">
              <span className="font-medium text-[var(--text-2)]">
                {lang === "hi" ? "पत्रिका " : "Patrika "}
              </span>
              <span className="font-bold text-[var(--red)]">
                {lang === "hi" ? "कैरोस" : "Kairos"}
              </span>
            </h1>
            <p className="text-[10px] text-[var(--text-3)] mt-1.5 tracking-[0.2em] uppercase font-semibold">
              {lang === "hi" ? "न्यूज़ इंजन" : "News Engine"}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {/* Pipeline controls ("Run now" + last-sync stats) are operational,
              not editorial — admins only. */}
          {role === "admin" && <IngestStatus />}

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

          <button
            onClick={signOut}
            className="flex items-center gap-1.5 bg-[var(--surface-2)] hover:bg-white border border-[var(--border)] hover:border-[var(--border-2)] rounded px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)]"
            title="Sign out"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </header>

      {!confined && <LiveTicker label={lang === "hi" ? "ताज़ा" : "On the wire"} />}

      {/* Layout */}
      <div className="grid grid-cols-[232px_1fr] min-h-[calc(100vh-96px)]">
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] py-4 flex flex-col gap-4">
          <div className="px-3">
            <ul className="space-y-0.5 list-none">
              {nav.map((item) => {
                // Pick the longest matching href so /sources/last-run highlights
                // only "Last run" and not also "Sources".
                const candidates = nav.filter((n) =>
                  n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
                );
                const bestMatch = candidates.reduce(
                  (longest, c) => (c.href.length > longest.href.length ? c : longest),
                  candidates[0] ?? { href: "" }
                );
                const isActive = bestMatch?.href === item.href;
                const locked = !!confined && item.href !== confined.home;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded text-[14px] transition-colors ${
                        isActive
                          ? "bg-[var(--red-soft)] text-[var(--red)] font-medium"
                          : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      } ${locked ? "opacity-55" : ""}`}
                    >
                      <span className={isActive ? "text-[var(--red)]" : "text-[var(--text-3)]"}>
                        {item.icon}
                      </span>
                      {t(item.key as Parameters<typeof t>[0])}
                      {locked && <Lock size={12} className="ml-auto text-[var(--text-3)]" />}
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

          {/* System status is an admin-only glance — editors/writers don't see it. */}
          {role === "admin" && (
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
          )}
        </aside>

        <main className="p-7 pb-20 min-w-0">{children}</main>
      </div>
    </div>
  );
}
