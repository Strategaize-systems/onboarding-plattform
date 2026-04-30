import { describe, it, expect, beforeEach, vi } from "vitest";
import { sendReminder, type ReminderTransport } from "../send-reminder";

function makeMockTransport() {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "mock" });
  const transport: ReminderTransport = { sendMail };
  return { transport, sendMail };
}

describe("sendReminder", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://onboarding.strategaizetransition.com";
    process.env.SMTP_FROM = "noreply@strategaizetransition.com";
  });

  it("sends a stage-1 reminder with correct subject and unsubscribe link", async () => {
    const { transport, sendMail } = makeMockTransport();
    const result = await sendReminder(
      {
        to: "employee@example.com",
        tenantName: "Acme GmbH",
        stage: "stage1",
        unsubscribeToken: "tok-stage1",
        captureUrl: "https://onboarding.strategaizetransition.com/capture/start",
      },
      transport
    );
    expect(result.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe("employee@example.com");
    expect(call.subject).toBe("Erinnerung: Du hast noch nicht angefangen");
    expect(call.html).toContain("Acme GmbH");
    expect(call.html).toContain(
      "https://onboarding.strategaizetransition.com/capture/start"
    );
    expect(call.html).toContain(
      "https://onboarding.strategaizetransition.com/api/unsubscribe/tok-stage1"
    );
  });

  it("sends a stage-2 reminder with the urgent subject", async () => {
    const { transport, sendMail } = makeMockTransport();
    const result = await sendReminder(
      {
        to: "employee2@example.com",
        tenantName: "Beta KG",
        stage: "stage2",
        unsubscribeToken: "tok-stage2",
        captureUrl: "https://onboarding.strategaizetransition.com/capture/start",
      },
      transport
    );
    expect(result.ok).toBe(true);
    const call = sendMail.mock.calls[0][0];
    expect(call.subject).toBe("Letzte Erinnerung: Bitte starte deine Erfassung");
    expect(call.html).toContain("Beta KG");
  });

  it("returns ok=false with error message when transport throws", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("smtp connection refused"));
    const transport: ReminderTransport = { sendMail };
    const result = await sendReminder(
      {
        to: "employee@example.com",
        tenantName: "Acme GmbH",
        stage: "stage1",
        unsubscribeToken: "tok-fail",
        captureUrl: "https://onboarding.strategaizetransition.com/capture/start",
      },
      transport
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("smtp connection refused");
  });
});
