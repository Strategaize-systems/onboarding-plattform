// V20 Review-Cleanup — Test fuer das gemeinsame Cron-Auth-Gate requireCronSecret.
// 503 (ENV fehlt) / 403 (Mismatch) / null (autorisiert).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({ captureWarning: vi.fn() }));

import { requireCronSecret } from "./cron-guard";

function reqWith(secret?: string): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-cron-secret", secret);
  return new Request("http://localhost/api/cron/x", { headers });
}

const ORIGINAL = process.env.CRON_SECRET;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("requireCronSecret", () => {
  it("503 wenn CRON_SECRET-ENV fehlt", async () => {
    delete process.env.CRON_SECRET;
    const res = requireCronSecret(reqWith("anything"), "cron:test");
    expect(res?.status).toBe(503);
  });

  it("403 bei Secret-Mismatch", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = requireCronSecret(reqWith("wrong-secret-x"), "cron:test");
    expect(res?.status).toBe(403);
  });

  it("403 bei fehlendem Header", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = requireCronSecret(reqWith(undefined), "cron:test");
    expect(res?.status).toBe(403);
  });

  it("null (autorisiert) bei korrektem Secret", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    const res = requireCronSecret(reqWith("the-real-secret"), "cron:test");
    expect(res).toBeNull();
  });
});
