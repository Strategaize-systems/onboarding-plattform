/**
 * V6 SLC-102 MT-2 — Role-Check Helper fuer Server-Side Auth-Gates.
 *
 * Reusable Helper, der die wiederholten Auth-Check-Bloecke in Server Actions
 * und Server Components kapselt. Existiert in Ergaenzung zu RLS — Defense-in-Depth.
 *
 * Auth-Routing-Matrix (Pfad-Klasse → erlaubte Rollen) wird in
 * `src/lib/supabase/middleware.ts` durchgesetzt; dieser Helper bietet den
 * gleichen Check fuer Server-Components/Actions, wenn man eine Rolle eindeutig
 * verlangt.
 */

import type { UserRole } from "@/types/db";

/**
 * Pfad-Klasse aus dem URL-Pfad ableiten. Wird in den Vitest-Faellen
 * verwendet, damit der Test nicht jede Spielart von Next-URLs neu nachbauen
 * muss.
 */
export type PathClass =
  | "admin" // /admin/*
  | "partner" // /partner/*
  | "dashboard" // /dashboard/* (tenant)
  | "capture" // /capture/* (capture-flow, V2/V3-Wizard)
  | "employee" // /employee/*
  | "public" // /login, /accept-invitation, /auth/*
  | "other";

export function classifyPath(pathname: string): PathClass {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/partner")) return "partner";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/capture")) return "capture";
  if (pathname.startsWith("/employee")) return "employee";
  if (
    pathname === "/login" ||
    pathname.startsWith("/accept-invitation") ||
    pathname.startsWith("/auth/")
  ) {
    return "public";
  }
  return "other";
}

/**
 * Erlaubt-Matrix fuer Pfad-Klassen × Rollen.
 *
 * Spiegelt die Logik in `updateSession` wider, damit die Tests die Matrix
 * deklarativ pruefen koennen. Bei Aenderungen an der Middleware MUSS hier
 * mit angepasst werden.
 */
export function isPathAllowedForRole(
  pathClass: PathClass,
  role: UserRole | null,
): boolean {
  // Public-Pfade darf jeder (auch unauthenticated).
  if (pathClass === "public") return true;

  // Unauthenticated darf nirgendwo rein (Middleware redirect → /login).
  if (!role) return false;

  switch (pathClass) {
    case "admin":
      // Layout-Logik (admin/layout.tsx) erlaubt zusaetzlich tenant_admin im
      // TenantAdminShell. Der harte Routing-Layer akzeptiert sowohl
      // strategaize_admin als auch tenant_admin auf /admin/*.
      return role === "strategaize_admin" || role === "tenant_admin";
    case "partner":
      // V6: /partner/* ist exklusiv partner_admin + strategaize_admin
      // (Cross-Tenant-Read). Impersonate-Mode fuer strategaize_admin ist V7+.
      return role === "partner_admin" || role === "strategaize_admin";
    case "dashboard":
      // /dashboard/* gehoert Mandanten. Employee + partner_admin werden in
      // Middleware umgeleitet.
      return role === "tenant_admin" || role === "tenant_member" || role === "strategaize_admin";
    case "capture":
      // /capture/* ist Wizard-Flow fuer Mandanten + tenant_admin.
      return role === "tenant_admin" || role === "tenant_member";
    case "employee":
      // /employee/* gehoert Mitarbeitern.
      return role === "employee";
    case "other":
      // Restliche Pfade (z.B. Root /) duerfen alle eingeloggten Rollen.
      return true;
  }
}

/**
 * Default-Redirect-Pfad nach Login pro Rolle.
 *
 * Spiegelt die Logik in `updateSession` (Login-Redirect).
 */
export function defaultLandingForRole(role: UserRole | null): string {
  switch (role) {
    case "employee":
      return "/employee";
    case "partner_admin":
      return "/partner/dashboard";
    case "strategaize_admin":
      return "/admin/tenants";
    case "tenant_admin":
    case "tenant_member":
      return "/dashboard";
    default:
      return "/login";
  }
}
