// V7.2 SLC-141 MT-5 (FEAT-060) — Pure-Logic Tests fuer SendReportByEmailModal.
//
// Vitest in node-env. Komponente selbst (SendReportByEmailModal.tsx) wird via
// /qa-Live-Smoke verifiziert (gleiche Konvention wie helper-text-modal-logic).

import { describe, it, expect } from "vitest";
import {
  CUSTOM_MESSAGE_MAX_LEN,
  ERROR_LABELS,
  GENERIC_ERROR,
  buildServerActionInput,
  customMessageRemaining,
  formatSuccessToast,
  hasAtLeastOneRecipient,
  isCustomMessageOverLimit,
  mapErrorToLabel,
} from "../send-report-modal-logic";

const emptyState = {
  recipientToSelf: false,
  recipientToPartner: false,
  additionalEmail: "",
  customMessage: "",
};

describe("hasAtLeastOneRecipient", () => {
  it("returns false when nothing is selected and additional is empty", () => {
    expect(hasAtLeastOneRecipient(emptyState)).toBe(false);
  });

  it("returns true when recipientToSelf is checked", () => {
    expect(
      hasAtLeastOneRecipient({ ...emptyState, recipientToSelf: true }),
    ).toBe(true);
  });

  it("returns true when recipientToPartner is checked", () => {
    expect(
      hasAtLeastOneRecipient({ ...emptyState, recipientToPartner: true }),
    ).toBe(true);
  });

  it("returns true when additionalEmail has content", () => {
    expect(
      hasAtLeastOneRecipient({
        ...emptyState,
        additionalEmail: "info@example.de",
      }),
    ).toBe(true);
  });

  it("ignores whitespace-only additionalEmail", () => {
    expect(
      hasAtLeastOneRecipient({ ...emptyState, additionalEmail: "   " }),
    ).toBe(false);
  });
});

describe("customMessageRemaining + isCustomMessageOverLimit", () => {
  it("returns full budget for empty message", () => {
    expect(customMessageRemaining(emptyState)).toBe(CUSTOM_MESSAGE_MAX_LEN);
    expect(isCustomMessageOverLimit(emptyState)).toBe(false);
  });

  it("returns zero at exactly the limit", () => {
    const state = { ...emptyState, customMessage: "x".repeat(CUSTOM_MESSAGE_MAX_LEN) };
    expect(customMessageRemaining(state)).toBe(0);
    expect(isCustomMessageOverLimit(state)).toBe(false);
  });

  it("returns negative + flags over-limit when too long", () => {
    const state = {
      ...emptyState,
      customMessage: "x".repeat(CUSTOM_MESSAGE_MAX_LEN + 7),
    };
    expect(customMessageRemaining(state)).toBe(-7);
    expect(isCustomMessageOverLimit(state)).toBe(true);
  });
});

describe("buildServerActionInput", () => {
  const sessionId = "f1f1f1f1-aaaa-bbbb-cccc-111111111111";

  it("forwards captureSessionId and primitive recipient flags", () => {
    const input = buildServerActionInput(sessionId, {
      ...emptyState,
      recipientToSelf: true,
      recipientToPartner: true,
    });
    expect(input.captureSessionId).toBe(sessionId);
    expect(input.recipientToSelf).toBe(true);
    expect(input.recipientToPartner).toBe(true);
  });

  it("trims additionalEmail and customMessage", () => {
    const input = buildServerActionInput(sessionId, {
      ...emptyState,
      additionalEmail: "  user@example.de  ",
      customMessage: "  Hallo  ",
    });
    expect(input.additionalEmail).toBe("user@example.de");
    expect(input.customMessage).toBe("Hallo");
  });

  it("collapses empty/whitespace strings to undefined", () => {
    const input = buildServerActionInput(sessionId, {
      ...emptyState,
      additionalEmail: "   ",
      customMessage: "",
    });
    expect(input.additionalEmail).toBeUndefined();
    expect(input.customMessage).toBeUndefined();
  });
});

describe("formatSuccessToast", () => {
  it("includes the recipients count", () => {
    expect(formatSuccessToast(2)).toBe("Bericht versendet an 2 Empfaenger.");
  });

  it("handles single-recipient case", () => {
    expect(formatSuccessToast(1)).toBe("Bericht versendet an 1 Empfaenger.");
  });
});

describe("mapErrorToLabel", () => {
  it("returns matching label for known error codes", () => {
    expect(mapErrorToLabel("rate_limit_exceeded")).toBe(
      ERROR_LABELS.rate_limit_exceeded,
    );
    expect(mapErrorToLabel("invalid_additional_email")).toBe(
      ERROR_LABELS.invalid_additional_email,
    );
  });

  it("returns generic fallback for unknown error codes", () => {
    expect(mapErrorToLabel("unknown_code_xyz")).toBe(GENERIC_ERROR);
  });

  it("covers all server-action error codes from MT-4", () => {
    const expected = [
      "invalid_capture_session_id",
      "no_recipients",
      "invalid_additional_email",
      "custom_message_too_long",
      "unauthenticated",
      "profile_not_found",
      "capture_session_lookup_failed",
      "capture_session_not_found",
      "forbidden",
      "not_finalized",
      "rate_limit_exceeded",
      "self_email_missing",
      "partner_email_missing",
      "no_partner_assigned",
      "no_recipients_resolved",
      "template_not_found",
      "pdf_render_failed",
      "smtp_send_failed",
    ];
    for (const code of expected) {
      expect(ERROR_LABELS[code], `missing label for ${code}`).toBeTruthy();
    }
  });
});
