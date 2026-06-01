// V8.1.1 SLC-164 MT-1 — Vitest fuer resolvePartnerForCaptureSession.
//
// Constants-Tests + Mock-Tests laufen immer. Live-DB-Roundtrip nur wenn
// TEST_DATABASE_URL gesetzt ist (analog SLC-163 audit.test.ts-Pattern).
//
// Begruendung Hotfix-Slice: ISSUE-086 (Bug A) + verdeckter Bug B
// (partner_organization.name existiert nicht — nur display_name) gemeinsam.
// Schema-Wahrheit per Coolify-DB-Verify 2026-06-01:
//   capture_session.tenant_id (NOT NULL)
//     -> tenants.parent_partner_tenant_id (uuid, NULLABLE)
//     -> partner_organization.tenant_id (uuid, NOT NULL, UNIQUE)
// CHECK-Constraint tenants_parent_partner_consistency: nur partner_client
// hat parent_partner_tenant_id IS NOT NULL.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePartnerForCaptureSession } from "../resolve-partner";

function makeMockClient(handlers: {
  tenants?: { data: { parent_partner_tenant_id: string | null } | null };
  partner?: {
    data: { id: string; display_name: string; contact_email: string | null } | null;
  };
}) {
  const calls: Array<{ table: string; eq: string }> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "tenants") {
      return {
        select: () => ({
          eq: (_col: string, val: string) => {
            calls.push({ table, eq: val });
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: handlers.tenants?.data ?? null,
                  error: null,
                }),
            };
          },
        }),
      };
    }
    if (table === "partner_organization") {
      return {
        select: () => ({
          eq: (_col: string, val: string) => {
            calls.push({ table, eq: val });
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: handlers.partner?.data ?? null,
                  error: null,
                }),
            };
          },
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  return {
    client: { from } as unknown as SupabaseClient,
    calls,
  };
}

describe("resolvePartnerForCaptureSession (SLC-164 MT-1 — Mock)", () => {
  it("happy path — tenant mit parent_partner_tenant_id + partner-row vorhanden", async () => {
    const { client, calls } = makeMockClient({
      tenants: { data: { parent_partner_tenant_id: "partner-tenant-uuid" } },
      partner: {
        data: {
          id: "partner-org-uuid",
          display_name: "Steuerberatung Beispiel GmbH",
          contact_email: "partner@example.de",
        },
      },
    });

    const result = await resolvePartnerForCaptureSession(client, {
      tenant_id: "mandant-tenant-uuid",
    });

    expect(result).toEqual({
      id: "partner-org-uuid",
      name: "Steuerberatung Beispiel GmbH",
      contact_email: "partner@example.de",
    });
    expect(calls).toEqual([
      { table: "tenants", eq: "mandant-tenant-uuid" },
      { table: "partner_organization", eq: "partner-tenant-uuid" },
    ]);
  });

  it("returns null wenn tenant-row nicht existiert", async () => {
    const { client } = makeMockClient({
      tenants: { data: null },
    });

    const result = await resolvePartnerForCaptureSession(client, {
      tenant_id: "nonexistent-uuid",
    });

    expect(result).toBeNull();
  });

  it("returns null bei direct_client (parent_partner_tenant_id IS NULL)", async () => {
    const { client } = makeMockClient({
      tenants: { data: { parent_partner_tenant_id: null } },
    });

    const result = await resolvePartnerForCaptureSession(client, {
      tenant_id: "direct-client-tenant-uuid",
    });

    expect(result).toBeNull();
  });

  it("returns null wenn partner-row nicht gefunden (Daten-Konsistenz-Drift)", async () => {
    const { client } = makeMockClient({
      tenants: { data: { parent_partner_tenant_id: "partner-tenant-uuid" } },
      partner: { data: null },
    });

    const result = await resolvePartnerForCaptureSession(client, {
      tenant_id: "mandant-tenant-uuid",
    });

    expect(result).toBeNull();
  });

  it("preserves null contact_email (StB-Skip-Pfad)", async () => {
    const { client } = makeMockClient({
      tenants: { data: { parent_partner_tenant_id: "partner-tenant-uuid" } },
      partner: {
        data: {
          id: "partner-org-uuid",
          display_name: "Partner ohne Email",
          contact_email: null,
        },
      },
    });

    const result = await resolvePartnerForCaptureSession(client, {
      tenant_id: "mandant-tenant-uuid",
    });

    expect(result).toEqual({
      id: "partner-org-uuid",
      name: "Partner ohne Email",
      contact_email: null,
    });
  });
});

// Live-DB-Roundtrip — gated auf TEST_DATABASE_URL.
// Pattern aus coolify-test-setup.md: docker run --network ... node:20 npx vitest
// gegen die echte Coolify-DB. Verifiziert das End-to-End-Pattern gegen die
// echten Spalten.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeLive = TEST_DATABASE_URL ? describe : describe.skip;

describeLive(
  "resolvePartnerForCaptureSession (SLC-164 — Live Coolify-DB)",
  async () => {
    // Dynamic import nur wenn TEST_DATABASE_URL gesetzt, damit Local-Vitest ohne
    // DB-Setup nicht zu pg-Connect-Versuchen kommt.
    const { Client } = await import("pg");

    it("schema sanity: capture_session.partner_organization_id existiert NICHT", async () => {
      const c = new Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      try {
        const r = await c.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='capture_session'
            AND column_name='partner_organization_id'
        `);
        expect(r.rowCount).toBe(0);
      } finally {
        await c.end();
      }
    });

    it("schema sanity: partner_organization hat display_name (NOT NULL), name existiert NICHT", async () => {
      const c = new Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      try {
        const r = await c.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='partner_organization'
            AND column_name IN ('name','display_name','contact_email')
        `);
        const cols = r.rows.map((row) => row.column_name as string).sort();
        expect(cols).toEqual(["contact_email", "display_name"]);
      } finally {
        await c.end();
      }
    });

    it("schema sanity: tenants hat parent_partner_tenant_id (nullable)", async () => {
      const c = new Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      try {
        const r = await c.query(`
          SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name='tenants'
            AND column_name='parent_partner_tenant_id'
        `);
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].is_nullable).toBe("YES");
      } finally {
        await c.end();
      }
    });
  },
);
