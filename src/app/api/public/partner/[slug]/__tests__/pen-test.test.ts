/**
 * V7 SLC-134 MT-3 — Pen-Test 3 Cases gegen `GET /api/public/partner/[slug]`.
 *
 * Fokus: Slug-Enumeration-Schutz + Reserve-Slug-Code-Path-Skip + Rate-Limit.
 *
 * Pattern: Co-located unter `src/app/api/public/partner/[slug]/__tests__/`.
 * Tests laufen gegen Coolify-DB im node:20-Container.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { GET } from "../route";
import * as adminModule from "@/lib/supabase/admin";
import {
  cleanupAllPentestArtifacts,
  cleanupTestPartner,
  setupTestPartner,
  type TestPartner,
} from "@/test/v7-signup-fixture";

function buildResolveRequest(
  slug: string,
  xff: string
): NextRequest {
  return new NextRequest(`http://localhost/api/public/partner/${slug}`, {
    method: "GET",
    headers: { "x-forwarded-for": xff },
  });
}

function buildParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

describe("V7 SLC-134 MT-3 — GET /api/public/partner/[slug] Pen-Test (3 Cases)", () => {
  let partner: TestPartner;

  beforeAll(async () => {
    await cleanupAllPentestArtifacts();
    partner = await setupTestPartner();
  });

  afterAll(async () => {
    await cleanupTestPartner(partner.tenant_id);
    vi.restoreAllMocks();
  });

  // ── Case 12 — Unbekannter Slug → 404 ────────────────────────────────────
  it("Case 12: unbekannter Slug → 404 unknown_partner", async () => {
    const req = buildResolveRequest("totally-nonexistent-pentest-slug", "10.51.1.1");
    const res = await GET(req, buildParams("totally-nonexistent-pentest-slug"));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unknown_partner");
  });

  // ── Case 13 — Reserve-Slug "admin" → 404 OHNE DB-Call ───────────────────
  it("Case 13: Reserve-Slug 'admin' → 404 OHNE DB-Lookup (Code-Path-Skip)", async () => {
    // Spy auf createAdminClient → Reserve-Pfad darf den NICHT aufrufen
    const spy = vi.spyOn(adminModule, "createAdminClient");
    spy.mockClear();

    const req = buildResolveRequest("admin", "10.51.1.2");
    const res = await GET(req, buildParams("admin"));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unknown_partner");

    // Reserve-Slug-Detection skippt DB komplett (vor Rate-Limit, vor admin-Client)
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  // ── Case 14 — 61. Request vom selben IP innerhalb 1h → 429 ──────────────
  it("Case 14: 61. GET partner-Request vom selben IP innerhalb 1h → 429", async () => {
    // Dedizierter IP fuer Rate-Limit-Test (60/h = partnerResolveLimiter)
    const rateIp = `10.51.99.${Math.floor(Math.random() * 200) + 1}`;

    // 60 Calls mit unbekanntem Slug → alle 404 (Rate-Limit nicht erreicht)
    for (let i = 0; i < 60; i++) {
      const slug = `nonexistent-rl-${i}`;
      const req = buildResolveRequest(slug, rateIp);
      const res = await GET(req, buildParams(slug));
      expect(res.status).toBe(404);
    }

    // 61. Call → 429
    const req61 = buildResolveRequest("nonexistent-rl-61", rateIp);
    const res61 = await GET(req61, buildParams("nonexistent-rl-61"));
    expect(res61.status).toBe(429);
    const json = (await res61.json()) as {
      error: string;
      retry_after_seconds: number;
    };
    expect(json.error).toBe("rate_limit_exceeded");
    expect(json.retry_after_seconds).toBeGreaterThan(0);
    expect(res61.headers.get("retry-after")).toBeTruthy();
  });
});
