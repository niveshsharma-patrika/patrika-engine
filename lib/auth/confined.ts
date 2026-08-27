import type { Role } from "./jwt";

/**
 * A "confined" role can use exactly ONE section of the app; every other page is
 * locked and every other API is 403. Adding another single-section user type is
 * just another entry here — the middleware, root layout, sidebar, login redirect
 * and locked screen all read from this one config.
 */
export type ConfinedRole = {
  home: string;                          // landing page after login + the one unlocked nav item
  labelEn: string;
  labelHi: string;
  isPage: (pathname: string) => boolean; // pages this role may open
  isApi: (pathname: string) => boolean;  // APIs this role may call
};

export const CONFINED_ROLES: Partial<Record<Role, ConfinedRole>> = {
  // Print user — Content Generator only.
  print: {
    home: "/content-generator",
    labelEn: "Content Generator",
    labelHi: "कंटेंट जनरेटर",
    isPage: (p) => p === "/content-generator" || p.startsWith("/content-generator/"),
    isApi: (p) => p.startsWith("/api/auth/") || p === "/api/drafts/generate",
  },
  // Olloi user — Olloi Content only (the cancer-care desk + composer flow).
  olloi: {
    home: "/olloi",
    labelEn: "Olloi Content",
    labelHi: "Olloi कंटेंट",
    isPage: (p) => p === "/olloi" || p.startsWith("/olloi/"),
    isApi: (p) =>
      p.startsWith("/api/auth/") ||
      p === "/api/magazine/ideas" ||
      p === "/api/drafts/generate" ||
      p === "/api/angles/generate" ||
      p === "/api/drafts/save" ||
      p === "/api/drafts/image" ||
      p === "/api/interactive/generate",
  },
};

/** The confinement config for a role, or undefined if the role is unconfined. */
export function confinedFor(role: string | null | undefined): ConfinedRole | undefined {
  return role ? CONFINED_ROLES[role as Role] : undefined;
}
