import { describe, it, expect } from "vitest";

import {
  classifyPath,
  defaultLandingForRole,
  isPathAllowedForRole,
  type PathClass,
} from "@/lib/auth/role-check";
import type { UserRole } from "@/types/db";

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
    it("blockt partner_admin", () => {
      expect(isPathAllowedForRole("admin", "partner_admin")).toBe(false);
    });
    it("blockt tenant_member", () => {
      expect(isPathAllowedForRole("admin", "tenant_member")).toBe(false);
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
    it("blockt tenant_member", () => {
      expect(isPathAllowedForRole("partner", "tenant_member")).toBe(false);
    });
    it("blockt employee", () => {
      expect(isPathAllowedForRole("partner", "employee")).toBe(false);
    });
    it("blockt unauthenticated", () => {
      expect(isPathAllowedForRole("partner", null)).toBe(false);
    });
  });

  describe("/dashboard/* (dashboard)", () => {
    it("erlaubt tenant_admin + tenant_member", () => {
      expect(isPathAllowedForRole("dashboard", "tenant_admin")).toBe(true);
      expect(isPathAllowedForRole("dashboard", "tenant_member")).toBe(true);
    });
    it("blockt partner_admin", () => {
      expect(isPathAllowedForRole("dashboard", "partner_admin")).toBe(false);
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
      expect(isPathAllowedForRole("employee", "tenant_member")).toBe(false);
      expect(isPathAllowedForRole("employee", "strategaize_admin")).toBe(false);
      expect(isPathAllowedForRole("employee", "partner_admin")).toBe(false);
    });
  });

  describe("public (login, accept-invitation, auth callback)", () => {
    const roles: ReadonlyArray<UserRole | null> = [
      "strategaize_admin",
      "tenant_admin",
      "tenant_member",
      "employee",
      "partner_admin",
      null,
    ];
    it.each(roles)("erlaubt %s auf public-Pfade", (role) => {
      expect(isPathAllowedForRole("public", role)).toBe(true);
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
  it("tenant_admin + tenant_member landen auf /dashboard", () => {
    expect(defaultLandingForRole("tenant_admin")).toBe("/dashboard");
    expect(defaultLandingForRole("tenant_member")).toBe("/dashboard");
  });
  it("employee landet auf /employee", () => {
    expect(defaultLandingForRole("employee")).toBe("/employee");
  });
  it("unauthenticated landet auf /login", () => {
    expect(defaultLandingForRole(null)).toBe("/login");
  });
});
