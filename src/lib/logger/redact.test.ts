// SLC-195 MT-3 — Pure-Mock-Test fuer redactSecrets. AC-195-3 (Secret-Keys
// maskiert rekursiv, Nicht-Secrets intakt).

import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets (SLC-195 MT-3, P-092)", () => {
  it("masks security + PII keys, keeps non-secret values", () => {
    const out = redactSecrets({
      token: "abc.def.ghi",
      email: "user@example.com",
      status: 401,
      source: "auth/login",
      "x-cron-secret": "s3cr3t",
    });
    expect(out.token).toBe("[REDACTED]");
    expect(out.email).toBe("[REDACTED]");
    expect(out["x-cron-secret"]).toBe("[REDACTED]");
    expect(out.status).toBe(401);
    expect(out.source).toBe("auth/login");
  });

  it("redacts recursively through nested objects and arrays", () => {
    const out = redactSecrets({
      outer: { authorization: "Bearer xyz", ok: true },
      list: [{ password: "hunter2" }, { keep: "yes" }],
    });
    expect(out.outer.authorization).toBe("[REDACTED]");
    expect(out.outer.ok).toBe(true);
    expect(out.list[0].password).toBe("[REDACTED]");
    expect(out.list[1].keep).toBe("yes");
  });

  it("is case-insensitive on keys", () => {
    const out = redactSecrets({ Token: "x", ACCESS_TOKEN: "y" });
    expect(out.Token).toBe("[REDACTED]");
    expect(out.ACCESS_TOKEN).toBe("[REDACTED]");
  });

  it("does not mutate the original object", () => {
    const original = { token: "abc", ok: 1 };
    const out = redactSecrets(original);
    expect(original.token).toBe("abc");
    expect(out.token).toBe("[REDACTED]");
  });

  it("handles circular references without throwing", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    const out = redactSecrets(a) as Record<string, unknown>;
    expect(out.name).toBe("x");
    expect(out.self).toBe("[Circular]");
  });

  it("supports extra keys via options", () => {
    const out = redactSecrets({ ssn: "123-45-6789" }, { extraKeys: ["ssn"] });
    expect(out.ssn).toBe("[REDACTED]");
  });

  it("does NOT flag a shared (non-cyclic) reference as [Circular]", () => {
    // DAG: dasselbe Objekt unter zwei Sibling-Keys — kein Zyklus. Beide
    // Vorkommen muessen erhalten bleiben (kein faelschliches [Circular]).
    const ctx = { keep: "yes", ok: 1 };
    const out = redactSecrets({ req: ctx, res: ctx }) as {
      req: { keep: string; ok: number };
      res: { keep: string; ok: number } | string;
    };
    expect(out.req.keep).toBe("yes");
    expect(out.res).not.toBe("[Circular]");
    expect((out.res as { keep: string }).keep).toBe("yes");
  });

  it("keeps redacting inside a shared reference reached twice", () => {
    const shared = { token: "abc", ok: true };
    const out = redactSecrets([shared, shared]) as Array<{
      token: string;
      ok: boolean;
    }>;
    expect(out[0].token).toBe("[REDACTED]");
    expect(out[1].token).toBe("[REDACTED]");
    expect(out[1].ok).toBe(true);
  });
});
