// V9.1 SLC-V9.1-A MT-4 — parseRecipientSlug Unit-Tests (offline).
// lookupEndpointBySlug (DB-Roundtrip) wird in route.test.ts gegen Coolify-DB getestet.

import { describe, it, expect } from "vitest";

import { parseRecipientSlug } from "../tenant-lookup";

describe("parseRecipientSlug", () => {
  it("extracts the slug from bulk-<slug>@domain", () => {
    expect(
      parseRecipientSlug("bulk-acme@bulk.strategaizetransition.com"),
    ).toBe("acme");
  });

  it("lowercases and trims the local part", () => {
    expect(
      parseRecipientSlug("  Bulk-AcMe@bulk.strategaizetransition.com  "),
    ).toBe("acme");
  });

  it("supports slugs with hyphens after the bulk- prefix", () => {
    expect(
      parseRecipientSlug("bulk-acme-2026@bulk.strategaizetransition.com"),
    ).toBe("acme-2026");
  });

  it("returns null without the bulk- prefix", () => {
    expect(parseRecipientSlug("info@bulk.strategaizetransition.com")).toBeNull();
  });

  it("returns null for an empty slug (just 'bulk-')", () => {
    expect(parseRecipientSlug("bulk-@bulk.strategaizetransition.com")).toBeNull();
  });

  it("returns null for malformed addresses", () => {
    expect(parseRecipientSlug("not-an-email")).toBeNull();
    expect(parseRecipientSlug("@bulk.strategaizetransition.com")).toBeNull();
    expect(parseRecipientSlug("")).toBeNull();
    expect(parseRecipientSlug(null)).toBeNull();
    expect(parseRecipientSlug(undefined)).toBeNull();
  });
});
