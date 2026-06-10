// V9.1 SLC-V9.1-B MT-4 — Vitest fuer GF-Notification-Helper.
//
// Pure build-Functions + notify-Wrapper mit injizierbarem sendMail (hermetisch).

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  buildFounderCapHitEmail,
  buildFounderApprovalRequiredEmail,
  notifyFounderCapHit,
  notifyFounderApprovalRequired,
  founderRecipient,
} from "../notify-founder";

const TENANT = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  delete process.env.FOUNDER_ALERT_EMAIL;
  delete process.env.ERROR_ALERT_EMAIL;
  delete process.env.SMTP_USER;
});

// ────────────────────────────────────────────────────────────────────────────
// buildFounderCapHitEmail
// ────────────────────────────────────────────────────────────────────────────

describe("buildFounderCapHitEmail", () => {
  it("enthaelt Tenant, Grund-Label, Cap + Actual (Daily)", () => {
    const out = buildFounderCapHitEmail({
      tenantId: TENANT,
      tenantName: "Acme GmbH",
      reason: "daily_cap_hit",
      cap: 5,
      actual: 5.4,
    });
    expect(out.subject).toContain("Tages-Kostenlimit");
    expect(out.subject).toContain("Acme GmbH");
    expect(out.text).toContain("Acme GmbH");
    expect(out.text).toContain(TENANT);
    expect(out.text).toContain("Tages-Kostenlimit");
    // EUR-Formatierung (de-DE)
    expect(out.text).toMatch(/5,\d{2}/); // cap 5,00
    expect(out.html).toContain("Bulk-Email-Audit");
  });

  it("Monthly-Reason rendert Monats-Label, Fallback ohne tenantName", () => {
    const out = buildFounderCapHitEmail({
      tenantId: TENANT,
      reason: "monthly_cap_hit",
      cap: 100,
      actual: 101,
    });
    expect(out.subject).toContain("Monats-Kostenlimit");
    expect(out.subject).toContain(TENANT); // Fallback auf ID
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildFounderApprovalRequiredEmail
// ────────────────────────────────────────────────────────────────────────────

describe("buildFounderApprovalRequiredEmail", () => {
  it("enthaelt Run-ID, Per-Email-Estimate, Schwelle, Gesamt", () => {
    const out = buildFounderApprovalRequiredEmail({
      tenantId: TENANT,
      tenantName: "Acme GmbH",
      bulkRunId: "run-abc",
      estimatedTotalEur: 60,
      estimatedPerEmailEur: 0.6,
      thresholdEur: 0.5,
    });
    expect(out.subject).toContain("Freigabe erforderlich");
    expect(out.text).toContain("run-abc");
    expect(out.text).toMatch(/0,60/); // per-email 0,60
    expect(out.html).toContain("awaiting_approval");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// founderRecipient resolution
// ────────────────────────────────────────────────────────────────────────────

describe("founderRecipient", () => {
  it("Prioritaet FOUNDER_ALERT_EMAIL > ERROR_ALERT_EMAIL > SMTP_USER", () => {
    process.env.SMTP_USER = "smtp@x.de";
    expect(founderRecipient()).toBe("smtp@x.de");
    process.env.ERROR_ALERT_EMAIL = "err@x.de";
    expect(founderRecipient()).toBe("err@x.de");
    process.env.FOUNDER_ALERT_EMAIL = "founder@x.de";
    expect(founderRecipient()).toBe("founder@x.de");
  });

  it("null wenn nichts konfiguriert", () => {
    expect(founderRecipient()).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// notify-Wrapper (injizierbares sendMail)
// ────────────────────────────────────────────────────────────────────────────

describe("notifyFounderCapHit / notifyFounderApprovalRequired", () => {
  it("ruft sendMail mit resolved recipient + liefert true", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const ok = await notifyFounderCapHit(
      { tenantId: TENANT, reason: "daily_cap_hit", cap: 5, actual: 6 },
      { sendMail: send, recipient: "founder@x.de" },
    );
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("founder@x.de");
    expect(arg.subject).toContain("Tages-Kostenlimit");
  });

  it("Silent-Skip (false, kein sendMail) wenn recipient null", async () => {
    const send = vi.fn();
    const ok = await notifyFounderCapHit(
      { tenantId: TENANT, reason: "daily_cap_hit", cap: 5, actual: 6 },
      { sendMail: send, recipient: null },
    );
    expect(ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("Approval-Notify ruft sendMail + liefert true", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const ok = await notifyFounderApprovalRequired(
      {
        tenantId: TENANT,
        bulkRunId: "run-1",
        estimatedTotalEur: 60,
        estimatedPerEmailEur: 0.6,
        thresholdEur: 0.5,
      },
      { sendMail: send, recipient: "founder@x.de" },
    );
    expect(ok).toBe(true);
    expect(send.mock.calls[0][0].subject).toContain("Freigabe erforderlich");
  });
});
