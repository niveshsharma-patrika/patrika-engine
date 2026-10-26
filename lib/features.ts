import type { Edition, Role } from "@/lib/auth/jwt";

/**
 * Feature registry — every controllable sidebar section. The single source of
 * truth for nav metadata (minus the icons, which stay in the client shell).
 * Visibility is configured in Admin → Features, but an admin can only RESTRICT
 * within a feature's defaults here — never grant a role/edition access it never
 * had by default (so admin-only tools can't be exposed from the UI).
 */

/** The non-confined roles an admin can toggle per feature. */
export const CONTROL_ROLES = ["admin", "editor", "writer"] as const;
export type ControlRole = (typeof CONTROL_ROLES)[number];
export const ALL_EDITIONS: Edition[] = ["print", "digital"];

export type Feature = {
  key: string; // stable key = the i18n nav label key
  href: string;
  defaultRoles: ControlRole[]; // baseline allow-list (admin can only narrow within this)
  defaultEditions: Edition[];
  confinedVisible: boolean; // shown (locked) to confined print/olloi roles
  isProtected?: boolean; // always on for admins — can't be disabled (no lockout)
  isHome?: boolean; // the dashboard — always reachable (redirect fallback), not toggleable
};

/** Features whose flags are locked to their defaults (can't be edited/disabled):
 *  the protected Features page and the dashboard home. */
export function isLockedFeature(f: Feature): boolean {
  return Boolean(f.isProtected || f.isHome);
}

const ALL: ControlRole[] = ["admin", "editor", "writer"];
const D: Edition[] = ["digital"];
const DP: Edition[] = ["digital", "print"];

export const FEATURES: Feature[] = [
  { key: "navDashboard",       href: "/",                         defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true, isHome: true },
  { key: "navToday",           href: "/today",                    defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navAllStories",      href: "/all-stories",              defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navEditorialFeed",   href: "/editorial-feed",           defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navResearch",        href: "/research",                 defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navGenerated",       href: "/generated",                defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navSuggestions",     href: "/suggestions",              defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navSources",         href: "/sources",                  defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navLastRun",         href: "/sources/last-run",         defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navStats",           href: "/stats",                    defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navStyle",           href: "/style",                    defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navDirectives",      href: "/directives",               defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navMagazines",       href: "/magazines",                defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navQuickBytes",      href: "/quick-bytes",              defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navContentGenerator",href: "/content-generator",        defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navOlloi",           href: "/olloi",                    defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navHoroscope",       href: "/horoscope",                defaultRoles: ALL,                 defaultEditions: D,  confinedVisible: true },
  { key: "navTwitter",         href: "/twitter",                  defaultRoles: ["admin", "editor"], defaultEditions: D,  confinedVisible: false },
  { key: "navSocial",          href: "/social",                   defaultRoles: ["admin", "editor"], defaultEditions: D,  confinedVisible: false },
  { key: "navFeedback",        href: "/feedback",                 defaultRoles: ALL,                 defaultEditions: DP, confinedVisible: true },
  { key: "navAdmin",           href: "/admin",                    defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navUsers",           href: "/admin/users",              defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navProductivity",    href: "/admin/productivity",       defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navCategoryMapping", href: "/admin/categories",         defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navWpPayloads",      href: "/admin/wordpress-payloads", defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false },
  { key: "navFeatures",        href: "/admin/features",           defaultRoles: ["admin"],           defaultEditions: D,  confinedVisible: false, isProtected: true },
];

export const FEATURE_BY_KEY: Record<string, Feature> = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

export type FlagLike = { enabled: boolean; roles: readonly string[]; editions: readonly string[] };

/** Can a NON-confined user see / open this feature? Pure — shared by the server
 *  gate and the client sidebar backstop. Confined roles use their own mechanism. */
/** The surface a user's digital-side checks run as. Admins work BOTH surfaces
 *  (they manage editions, so they must never be locked onto the print side):
 *  on the digital app they always count as digital, whatever their edition. */
export function digitalEdition<E extends string>(role: string, edition: E): E | "digital" {
  return role === "admin" ? "digital" : edition;
}

export function canAccessFeature(flag: FlagLike | undefined, feature: Feature, role: string, edition: string): boolean {
  if (feature.isProtected) return role === "admin";
  if (feature.isHome) return true; // dashboard — always reachable (redirect fallback)
  if (!flag) return false;
  return flag.enabled && flag.roles.includes(role) && flag.editions.includes(edition);
}

/** The feature a pathname belongs to, by longest matching href (or null). So
 *  /admin/users → navUsers (not navAdmin), /sources/last-run → navLastRun. */
export function featureForPath(pathname: string): Feature | null {
  let best: Feature | null = null;
  for (const f of FEATURES) {
    const match = f.href === "/" ? pathname === "/" : pathname === f.href || pathname.startsWith(f.href + "/");
    if (match && (!best || f.href.length > best.href.length)) best = f;
  }
  return best;
}

export type { Role };
