import { describe, it, expect } from "vitest";

import {
  classifyPath,
  defaultLandingForRole,
  isPathAllowedForRole,
  type PathClass,
} from "@/lib/auth/role-check";
import type { UserRole } from "@/types/db";

/**
 * V10.3 SLC-187 MT-3 — Die Rolle "tenant_member" wurde ersatzlos entfernt
 * (4-Rollen-Modell, DEC-263). Sie darf nur noch als *unbekannte* Rolle
 * auftreten und muss dann ueberall fail-closed behandelt werden
 * (keine Pfad-Freigabe, Login-Fallback bei Landing). Cast auf UserRole,
 * um den entfernten Enum-Wert im Test simulieren zu koennen.
 */
const REMOVED_TENANT_MEMBER = "tenant_member" as unknown as UserRole;

/**
 * V6 SLC-102 MT-2 — Vitest fuer Auth-Routing-Matrix.
 *
 * Diese Tests pruefen die deklarative Erlaubt-Matrix (Pfad-Klasse × Rolle) aus
 * `src/lib/auth/role-check.ts`. Die tatsaechliche Routing-Durchsetzung passiert
 * in `src/lib/supabase/middleware.ts` — bei Aenderungen dort muss diese Matrix
 * mitgepflegt werden.
 *
 * Slice-Verify (MT-2): "Vitest 4 Faelle: 4 Rollen × 2 Pfad-Klassen
 * (/admin/* und /partner/*)". Diese Suite deckt das + die uebrigen
 * Pfad-Klassen + die Login-Default-Landings ab.
 */

describe("classifyPath", () => {
  const cases: ReadonlyArray<[string, PathClass]> = [
    ["/admin", "admin"],
    ["/admin/tenants", "admin"],
    ["/admin/partners/abc-123/edit", "admin"],
    ["/partner", "partner"],
    ["/partner/dashboard", "partner"],
    ["/partner/dashboard/stammdaten", "partner"],
    ["/dashboard", "dashboard"],
    ["/dashboard/tenant/x", "dashboard"],
    ["/capture/wizard", "capture"],
    ["/employee", "employee"],
    ["/employee/walkthrough/1", "employee"],
    ["/login", "public"],
    ["/accept-invitation/abc", "public"],
    ["/auth/callback", "public"],
    ["/", "other"],
    ["/api/health", "other"],
    ["/something-else", "other"],
  ];

  it.each(cases)("classifies %s as %s", (pathname, expected) => {
    expect(classifyPath(pathname)).toBe(expected);
  });
});

describe("isPathAllowedForRole — Matrix Rolle × Pfad-Klasse", () => {
  describe("/admin/* (admin)", () => {
    it("erlaubt strategaize_admin", () => {
      expect(isPathAllowedForRole("admin", "strategaize_admin")).toBe(true);
    });
    it("erlaubt tenant_admin (TenantAdminShell-Pfad)", () => {
      expect(isPathAllowedForRole("admin", "tenant_admin")).toBe(true);
    });
    it("erlaubt strategaize_berater (V10.4 SLC-188, gescopte Sicht)", () => {
      expect(isPathAllowedForRole("admin", "strategaize_berater")).toBe(true);
    });
    it("blockt partner_admin", () => {
      expect(isPathAllowedForRole("admin", "partner_admin")).toBe(false);
    });
    it("blockt entfernte Rolle tenant_member (fail-closed, wie unbekannte Rolle)", () => {
      expect(isPathAllowedForRole("admin", REMOVED_TENANT_MEMBER)).toBe(false);
    });
    it("blockt employee", () => {
      expect(isPathAllowedForRole("admin", "employee")).toBe(false);
    });
    it("blockt unauthenticated", () => {
      expect(isPathAllowedForRole("admin", null)).toBe(false);
    });
  });

  describe("/partner/* (partner)", () => {
    it("erlaubt partner_admin", () => {
      expect(isPathAllowedForRole("partner", "partner_admin")).toBe(true);
    });
    it("erlaubt strategaize_admin (Cross-Tenant-Read, Impersonate-Mode V7+)", () => {
      expect(isPathAllowedForRole("partner", "strategaize_admin")).toBe(true);
    });
    it("blockt tenant_admin", () => {
      expect(isPathAllowedForRole("partner", "tenant_admin")).toBe(false);
    });
    it("blockt strategaize_berater (V10.4, Partner-Verwaltung ist P3)", () => {
      expect(isPathAllowedForRole("partner", "strategaize_berater")).toBe(false);
    });
    it("blockt entfernte Rolle tenant_member (fail-closed, wie unbekannte Rolle)", () => {
      expect(isPathAllowedForRole("partner", REMOVED_TENANT_MEMBER)).toBe(false);
    });
    it("blockt employee", () => {
      expect(isPathAllowedForRole("partner", "employee")).toBe(false);
    });
    it("blockt unauthenticated", () => {
      expect(isPathAllowedForRole("partner", null)).toBe(false);
    });
  });

  describe("/dashboard/* (dashboard)", () => {
    it("erlaubt tenant_admin", () => {
      expect(isPathAllowedForRole("dashboard", "tenant_admin")).toBe(true);
    });
    it("blockt entfernte Rolle tenant_member (fail-closed, wie unbekannte Rolle)", () => {
      expect(isPathAllowedForRole("dashboard", REMOVED_TENANT_MEMBER)).toBe(false);
    });
    it("blockt partner_admin", () => {
      expect(isPathAllowedForRole("dashboard", "partner_admin")).toBe(false);
    });
    it("blockt strategaize_berater (V10.4, Mandanten-Dashboard nicht Berater-Pfad)", () => {
      expect(isPathAllowedForRole("dashboard", "strategaize_berater")).toBe(false);
    });
    it("blockt employee", () => {
      expect(isPathAllowedForRole("dashboard", "employee")).toBe(false);
    });
  });

  describe("/employee/* (employee)", () => {
    it("erlaubt employee", () => {
      expect(isPathAllowedForRole("employee", "employee")).toBe(true);
    });
    it("blockt alle anderen Rollen", () => {
      expect(isPathAllowedForRole("employee", "tenant_admin")).toBe(false);
      expect(isPathAllowedForRole("employee", "strategaize_admin")).toBe(false);
      expect(isPathAllowedForRole("employee", "partner_admin")).toBe(false);
    });
    it("blockt entfernte Rolle tenant_member (fail-closed, wie unbekannte Rolle)", () => {
      expect(isPathAllowedForRole("employee", REMOVED_TENANT_MEMBER)).toBe(false);
    });
  });

  describe("public (login, accept-invitation, auth callback)", () => {
    const roles: ReadonlyArray<UserRole | null> = [
      "strategaize_admin",
      "tenant_admin",
      "employee",
      "partner_admin",
      null,
    ];
    it.each(roles)("erlaubt %s auf public-Pfade", (role) => {
      expect(isPathAllowedForRole("public", role)).toBe(true);
    });
    it("erlaubt auch die entfernte Rolle tenant_member auf public-Pfade", () => {
      expect(isPathAllowedForRole("public", REMOVED_TENANT_MEMBER)).toBe(true);
    });
  });
});

describe("defaultLandingForRole", () => {
  it("strategaize_admin landet auf /admin/tenants", () => {
    expect(defaultLandingForRole("strategaize_admin")).toBe("/admin/tenants");
  });
  it("partner_admin landet auf /partner/dashboard (SLC-102 MT-2)", () => {
    expect(defaultLandingForRole("partner_admin")).toBe("/partner/dashboard");
  });
  it("strategaize_berater landet auf /admin/mein-tag (V10.4 SLC-188)", () => {
    expect(defaultLandingForRole("strategaize_berater")).toBe("/admin/mein-tag");
  });
  it("tenant_admin landet auf /dashboard", () => {
    expect(defaultLandingForRole("tenant_admin")).toBe("/dashboard");
  });
  it("entfernte Rolle tenant_member faellt auf /login zurueck (fail-closed, wie unbekannte Rolle)", () => {
    expect(defaultLandingForRole(REMOVED_TENANT_MEMBER)).toBe("/login");
  });
  it("employee landet auf /employee", () => {
    expect(defaultLandingForRole("employee")).toBe("/employee");
  });
  it("unauthenticated landet auf /login", () => {
    expect(defaultLandingForRole(null)).toBe("/login");
  });
});
