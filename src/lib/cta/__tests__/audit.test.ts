// V8.1 SLC-163 MT-6 — Vitest fuer CTA-Audit-Wrappers.
//
// Constants-Tests laufen immer. Row-Shape gegen Coolify-DB nur wenn
// TEST_DATABASE_URL gesetzt ist (analog SLC-161 audit.test.ts-Pattern).

import { describe, it, expect, vi } from "vitest";

import {
  V8_1_CTA_TRIGGER_SOURCE,
  V8_1_CTA_INVALID_TOKEN_SOURCE,
  V8_1_CTA_IDEMPOTENT_SKIP_SOURCE,
  V8_1_STB_SKIPPED_NO_EMAIL_SOURCE,
  recordCtaTrigger,
  recordCtaInvalidToken,
  recordCtaIdempotentSkip,
  recordStbNotificationSkippedNoEmail,
} from "../audit";

describe("CTA-Audit Constants (SLC-163 MT-6)", () => {
  it("V8_1_CTA_TRIGGER_SOURCE matches spec", () => {
    expect(V8_1_CTA_TRIGGER_SOURCE).toBe("cta_strategaize_freigabe");
  });
  it("V8_1_CTA_INVALID_TOKEN_SOURCE matches spec", () => {
    expect(V8_1_CTA_INVALID_TOKEN_SOURCE).toBe("cta_invalid_token");
  });
  it("V8_1_CTA_IDEMPOTENT_SKIP_SOURCE matches spec", () => {
    expect(V8_1_CTA_IDEMPOTENT_SKIP_SOURCE).toBe("cta_idempotent_skip");
  });
  it("V8_1_STB_SKIPPED_NO_EMAIL_SOURCE matches spec", () => {
    expect(V8_1_STB_SKIPPED_NO_EMAIL_SOURCE).toBe(
      "stb_notification_skipped_no_email",
    );
  });
});

function makeMockClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return {
    client: { from } as unknown as Parameters<typeof recordCtaTrigger>[0],
    insert,
    from,
  };
}

describe("CTA-Audit Wrappers — Row-Shape (mocked SupabaseClient)", () => {
  it("recordCtaTrigger inserts into error_log with correct shape", async () => {
    const { client, insert, from } = makeMockClient();
    await recordCtaTrigger(client, {
      captureSessionId: "cs-001",
      source: "pdf_magic_link",
      bdSent: true,
      stbSent: true,
    });
    expect(from).toHaveBeenCalledWith("error_log");
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.level).toBe("info");
    expect(row.source).toBe("cta_strategaize_freigabe");
    expect(row.message).toContain("cs-001");
    expect(row.message).toContain("pdf_magic_link");
    expect(row.message).toContain("bd=true");
    expect(row.message).toContain("stb=true");
    expect(row.metadata).toMatchObject({
      capture_session_id: "cs-001",
      trigger_source: "pdf_magic_link",
      bd_sent: true,
      stb_sent: true,
      stb_skip_reason: null,
    });
  });

  it("recordCtaTrigger captures stb_skip_reason in message + metadata", async () => {
    const { client, insert } = makeMockClient();
    await recordCtaTrigger(client, {
      captureSessionId: "cs-002",
      source: "web_action",
      bdSent: true,
      stbSent: false,
      stbSkipReason: "no_email",
    });
    const row = insert.mock.calls[0][0];
    expect(row.message).toContain("stb_skip=no_email");
    expect(row.metadata.stb_skip_reason).toBe("no_email");
  });

  it("recordCtaInvalidToken inserts warn-level entry with truncated excerpt", async () => {
    const { client, insert } = makeMockClient();
    const longToken = "x".repeat(200);
    await recordCtaInvalidToken(client, {
      tokenExcerpt: longToken,
      reason: "invalid_signature",
    });
    const row = insert.mock.calls[0][0];
    expect(row.level).toBe("warn");
    expect(row.source).toBe("cta_invalid_token");
    expect(row.metadata.token_excerpt.length).toBe(64);
    expect(row.metadata.reason).toBe("invalid_signature");
  });

  it("recordCtaIdempotentSkip inserts info-level entry", async () => {
    const { client, insert } = makeMockClient();
    await recordCtaIdempotentSkip(client, {
      captureSessionId: "cs-003",
      source: "web_action",
    });
    const row = insert.mock.calls[0][0];
    expect(row.level).toBe("info");
    expect(row.source).toBe("cta_idempotent_skip");
    expect(row.metadata.capture_session_id).toBe("cs-003");
    expect(row.metadata.trigger_source).toBe("web_action");
  });

  it("recordStbNotificationSkippedNoEmail inserts info-level entry", async () => {
    const { client, insert } = makeMockClient();
    await recordStbNotificationSkippedNoEmail(client, {
      captureSessionId: "cs-004",
      partnerOrganizationId: "po-001",
    });
    const row = insert.mock.calls[0][0];
    expect(row.level).toBe("info");
    expect(row.source).toBe("stb_notification_skipped_no_email");
    expect(row.metadata.capture_session_id).toBe("cs-004");
    expect(row.metadata.partner_organization_id).toBe("po-001");
  });

  it("recordCtaTrigger swallows insert-error silently (non-fatal)", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { message: "DB down" } });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as unknown as Parameters<
      typeof recordCtaTrigger
    >[0];
    await expect(
      recordCtaTrigger(client, {
        captureSessionId: "cs-005",
        source: "pdf_magic_link",
        bdSent: false,
        stbSent: false,
      }),
    ).resolves.toBeUndefined();
  });
});
