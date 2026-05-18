import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock createAdminClient with an atomic-update simulation ─────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { provisionSelfSignupTenant } from "@/lib/signup/auto-provision";

/**
 * Race-Test: SLC-133 MT-4
 *
 * Simuliert zwei parallele Verify-Klicks auf den gleichen Verify-Link.
 * Beide rufen `provisionSelfSignupTenant` mit der gleichen `pending_signup_id`
 * auf. In der Realitaet schuetzt das `UPDATE pending_signup SET status='verified'
 * WHERE id=$1 AND status='pending'` atomar: der erste COMMIT setzt status
 * auf 'verified', der zweite UPDATE sieht 0 rows matched (weil status nun
 * bereits 'verified' ist) und returnt `pending_already_verified=true`.
 *
 * Wir simulieren das mit einem geteilten Status-Counter im Mock: erster
 * UPDATE-Aufruf returnt 1 row, alle weiteren 0 rows. Beide Anrufer
 * provisionieren tenant + user + mapping (keine Race-Verteidigung dort —
 * das ist V7-Tradeoff; siehe DEC-129 + R-3 in der Slice-Spec). Das ist
 * akzeptiert weil zweiter Klick im echten Verify-Endpoint NIE durchgeht
 * (Branch C 'already_verified' faengt ihn vorher ab — race-Test deckt nur
 * den theoretischen Fall ab dass zwei provisionSelfSignupTenant-Aufrufe
 * den UPDATE-Race verlieren).
 */

let pendingStatus: "pending" | "verified";
let firstUpdateConsumed: boolean;

function buildSharedAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table === "tenants") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: `tenant-${Math.random().toString(36).slice(2, 8)}` },
              error: null,
            }),
          })),
          delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }
      if (table === "partner_client_mapping") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "pending_signup") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                return {
                  select: vi.fn(async () => {
                    // Atomic-Filter-Simulation: wenn pendingStatus !== 'pending'
                    // dann 0 rows matched.
                    if (col === "status" && val === "pending") {
                      if (!firstUpdateConsumed && pendingStatus === "pending") {
                        firstUpdateConsumed = true;
                        pendingStatus = "verified";
                        return { data: [{ id: "pending-1" }], error: null };
                      }
                      // Spaeter UPDATE sieht status='verified' — kein Match.
                      return { data: [], error: null };
                    }
                    return { data: [], error: null };
                  }),
                };
              }),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: `user-${Math.random().toString(36).slice(2, 8)}` } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingStatus = "pending";
  firstUpdateConsumed = false;
});

describe("provisionSelfSignupTenant race-condition — V7 SLC-133 MT-4", () => {
  it("Two parallel provisionSelfSignupTenant calls: first wins UPDATE, second sees pending_already_verified=true", async () => {
    const admin = buildSharedAdmin();
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const input = {
      pending_signup_id: "pending-1",
      partner_tenant_id: "partner-1",
      email_lower: "alice@example.com",
      first_name: "Alice",
      last_name: "Mueller",
      company_name: "Acme",
      dsgvo_consent_text_version: "v1-2026-05",
      dsgvo_consent_accepted_at: "2026-05-18T10:00:00.000Z",
    };

    const [result1, result2] = await Promise.all([
      provisionSelfSignupTenant(input),
      provisionSelfSignupTenant(input),
    ]);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      // Genau einer der beiden hat das UPDATE-Race gewonnen.
      const wonCount =
        (result1.pending_already_verified ? 0 : 1) +
        (result2.pending_already_verified ? 0 : 1);
      expect(wonCount).toBe(1);
    }
  });
});
