/**
 * V7 SLC-134 MT-4 — Pen-Test 4 Cases gegen `/auth/verify-signup` Page.
 *
 * Pattern: Co-located unter `src/app/auth/verify-signup/__tests__/`.
 * Server-Component-Tests: rufen `VerifySignupPage({ searchParams })` direkt,
 * inspizieren ReactElement-Return-Type oder fangen den NEXT_REDIRECT-Error
 * (Mock fuer `next/navigation` wirft den Error mit digest, wie Next.js es tut).
 *
 * Tests laufen gegen Coolify-DB im node:20-Container. provisionSelfSignupTenant
 * macht echte auth.admin.createUser + DB-Inserts — ENV PFLICHT:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, TEST_DATABASE_URL.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const redirectCalls: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    redirectCalls.push(url);
    const err = new Error("NEXT_REDIRECT");
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

import VerifySignupPage from "../page";
import {
  cleanupAllPentestArtifacts,
  cleanupTestPartner,
  markPendingAsVerified,
  openTestDbClient,
  setupExpiredPendingSignup,
  setupTestPartner,
  setupTestPendingSignup,
  type TestPartner,
} from "@/test/v7-signup-fixture";

function makeSearchParams(token: string): {
  searchParams: Promise<{ token: string }>;
} {
  return { searchParams: Promise.resolve({ token }) };
}

/** Liefert den `type.name` eines React-Elements (z.B. "InvalidLinkPage"). */
function reactComponentName(element: unknown): string | null {
  if (!element || typeof element !== "object") return null;
  const e = element as { type?: { name?: string; displayName?: string } };
  if (!e.type) return null;
  return e.type.displayName ?? e.type.name ?? null;
}

describe("V7 SLC-134 MT-4 — /auth/verify-signup Pen-Test (4 Cases)", () => {
  let partner: TestPartner;

  beforeAll(async () => {
    await cleanupAllPentestArtifacts();
    partner = await setupTestPartner();
  });

  afterAll(async () => {
    await cleanupTestPartner(partner.tenant_id);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    redirectCalls.length = 0;
  });

  // ── Case 15 — Token-Hash unbekannt → Invalid-Link-Page ──────────────────
  it("Case 15: ungueltiger Token-Hash → InvalidLinkPage", async () => {
    // 64-hex-Format passt das TOKEN_REGEX, aber Hash hat keinen DB-Eintrag.
    const fakeToken = "deadbeef".repeat(8); // 64 hex chars
    const result = await VerifySignupPage(makeSearchParams(fakeToken));
    expect(reactComponentName(result)).toBe("InvalidLinkPage");
  });

  // ── Case 16 — Expired Token → ExpiredLinkPage ───────────────────────────
  it("Case 16: expired Token → ExpiredLinkPage", async () => {
    const email = `expired-${Date.now()}@example.test`;
    const seed = await setupExpiredPendingSignup(partner.tenant_id, email, 1);
    const result = await VerifySignupPage(makeSearchParams(seed.token_clear));
    expect(reactComponentName(result)).toBe("ExpiredLinkPage");
  });

  // ── Case 17 — Bereits-verifiziert (Replay) → Redirect /login ────────────
  it("Case 17: bereits-verifizierter Token → redirect /login?info=already_verified", async () => {
    const email = `replay-${Date.now()}@example.test`;
    const seed = await setupTestPendingSignup(partner.tenant_id, email);
    await markPendingAsVerified(seed.pending_id);

    await expect(
      VerifySignupPage(makeSearchParams(seed.token_clear))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectCalls.length).toBe(1);
    expect(redirectCalls[0]).toContain("/login");
    expect(redirectCalls[0]).toContain("already_verified");
  });

  // ── Case 18 — 2 parallel-Aufrufe gleichem Token → atomar ────────────────
  it("Case 18: 2 parallel Klicks auf gleichen Verify-Link → genau 1 Provisioning", async () => {
    const email = `race-${Date.now()}@example.test`;
    const seed = await setupTestPendingSignup(partner.tenant_id, email);

    // Promise.allSettled damit ein Fehler den anderen nicht abbricht
    const results = await Promise.allSettled([
      VerifySignupPage(makeSearchParams(seed.token_clear)),
      VerifySignupPage(makeSearchParams(seed.token_clear)),
    ]);

    // Beide muessen settle (entweder redirect zur magic-link-URL ODER
    // ErrorPage ODER replay-redirect zu /login). Kein totaler Crash.
    expect(results.length).toBe(2);
    for (const r of results) {
      if (r.status === "rejected") {
        // NEXT_REDIRECT ist OK — Page ruft redirect() bei Erfolg + replay
        expect((r.reason as Error).message).toBe("NEXT_REDIRECT");
      } else {
        // ErrorPage oder ExpiredLinkPage (unwahrscheinlich) — Component-Return
        const name = reactComponentName(r.value);
        expect(["ErrorPage", "InvalidLinkPage"]).toContain(name);
      }
    }

    // Direct-DB-Probe: genau 1 partner_client_mapping fuer diesen Mandant
    // existiert (race-guard verhinderte Doppel-Provisioning).
    const client = await openTestDbClient();
    try {
      const mappings = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM partner_client_mapping pcm
         JOIN profiles p ON p.tenant_id = pcm.client_tenant_id
         WHERE p.email = $1
           AND pcm.partner_tenant_id = $2`,
        [email.toLowerCase(), partner.tenant_id]
      );
      expect(Number(mappings.rows[0].count)).toBe(1);

      // pending_signup MUSS status='verified' sein (atomar gesetzt durch
      // den Aufruf der das Race gewonnen hat).
      const pendingState = await client.query<{ status: string }>(
        `SELECT status FROM pending_signup WHERE id = $1`,
        [seed.pending_id]
      );
      expect(pendingState.rows[0].status).toBe("verified");
    } finally {
      await client.end();
    }
  });
});
