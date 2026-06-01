// V8.1 SLC-163 MT-5 — Vitest fuer Dual-Email-Orchestrator.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { sendStrategaizeAnfrageEmails } from "../send-strategaize-anfrage-emails";

// vi.hoisted-Pattern pro IMP-917 / feedback_vi_hoisted_for_mock_vars.
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendMail: mocks.sendMail,
}));

const BASE_INPUT = {
  captureSession: {
    id: "cs-fixture-001",
    mandant_email: "max@example.com",
    mandant_name: "Max Muster",
    mandant_firma: "Muster GmbH",
    sui_score: 2.5,
    drei_hebel_modul_namen: [
      "Modul 4 — Operative Skalierbarkeit",
      "Modul 7 — Finanzielle Transparenz",
      "Modul 6 — Vertrieb & Kunden",
    ],
    diagnose_link_admin: "https://op.example/admin/diag/cs-fixture-001",
  },
  partner: {
    id: "po-fixture-001",
    name: "Partner XYZ",
    contact_email: "kontakt@partner-xyz.de",
  },
};

describe("sendStrategaizeAnfrageEmails (SLC-163 MT-5)", () => {
  beforeEach(() => {
    mocks.sendMail.mockReset();
    process.env.STRATEGAIZE_BD_EMAIL = "bd@strategaizetransition.de";
    process.env.SMTP_FROM = "noreply@strategaize.de";
  });

  it("both sends success → bd_sent + stb_sent true", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    const result = await sendStrategaizeAnfrageEmails(BASE_INPUT);
    expect(result).toEqual({ bd_sent: true, stb_sent: true });
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
  });

  it("empty contact_email → bd_sent + stb skip with no_email reason", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    const result = await sendStrategaizeAnfrageEmails({
      ...BASE_INPUT,
      partner: { ...BASE_INPUT.partner, contact_email: "" },
    });
    expect(result.bd_sent).toBe(true);
    expect(result.stb_sent).toBe(false);
    expect(result.stb_skip_reason).toBe("no_email");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it("null contact_email → bd_sent + stb skip with no_email reason", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    const result = await sendStrategaizeAnfrageEmails({
      ...BASE_INPUT,
      partner: { ...BASE_INPUT.partner, contact_email: null },
    });
    expect(result.stb_skip_reason).toBe("no_email");
  });

  it("whitespace contact_email → bd_sent + stb skip with no_email reason", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    const result = await sendStrategaizeAnfrageEmails({
      ...BASE_INPUT,
      partner: { ...BASE_INPUT.partner, contact_email: "   " },
    });
    expect(result.stb_skip_reason).toBe("no_email");
  });

  it("StB SMTP-fail → bd_sent true + stb_sent false + smtp_fail reason", async () => {
    mocks.sendMail
      .mockResolvedValueOnce(undefined) // BD send succeeds
      .mockRejectedValueOnce(new Error("smtp connection refused")); // StB fails
    const result = await sendStrategaizeAnfrageEmails(BASE_INPUT);
    expect(result.bd_sent).toBe(true);
    expect(result.stb_sent).toBe(false);
    expect(result.stb_skip_reason).toBe("smtp_fail");
    expect(result.stb_error).toContain("smtp connection refused");
  });

  it("BD SMTP-fail blockiert nicht StB-Send", async () => {
    mocks.sendMail
      .mockRejectedValueOnce(new Error("bd smtp fail"))
      .mockResolvedValueOnce(undefined);
    const result = await sendStrategaizeAnfrageEmails(BASE_INPUT);
    expect(result.bd_sent).toBe(false);
    expect(result.stb_sent).toBe(true);
    expect(result.bd_error).toContain("bd smtp fail");
  });

  it("both sends fail → both error fields populated", async () => {
    mocks.sendMail
      .mockRejectedValueOnce(new Error("bd dead"))
      .mockRejectedValueOnce(new Error("stb dead"));
    const result = await sendStrategaizeAnfrageEmails(BASE_INPUT);
    expect(result.bd_sent).toBe(false);
    expect(result.stb_sent).toBe(false);
    expect(result.stb_skip_reason).toBe("smtp_fail");
    expect(result.bd_error).toBe("bd dead");
    expect(result.stb_error).toBe("stb dead");
  });

  it("BD-mail recipient uses STRATEGAIZE_BD_EMAIL env", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    process.env.STRATEGAIZE_BD_EMAIL = "lead-inbox@custom.example";
    await sendStrategaizeAnfrageEmails(BASE_INPUT);
    expect(mocks.sendMail.mock.calls[0][0].to).toBe(
      "lead-inbox@custom.example",
    );
  });

  it("StB-mail recipient is partner.contact_email", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    await sendStrategaizeAnfrageEmails(BASE_INPUT);
    const stbCall = mocks.sendMail.mock.calls.find(
      (c) => c[0].to === "kontakt@partner-xyz.de",
    );
    expect(stbCall).toBeDefined();
  });

  it("BD-subject follows [OP-Lead] pattern", async () => {
    mocks.sendMail.mockResolvedValue(undefined);
    await sendStrategaizeAnfrageEmails(BASE_INPUT);
    const bdCall = mocks.sendMail.mock.calls.find((c) =>
      String(c[0].subject).startsWith("[OP-Lead]"),
    );
    expect(bdCall).toBeDefined();
    expect(bdCall![0].subject).toContain("Muster GmbH");
  });
});
