// V7.2 SLC-141 MT-4 — Vitest fuer sendDiagnoseReportByEmail Server-Action.
//
// Strategie: vi.mock fuer Supabase, logger, email, PDF-Render, Branding,
// Email-Template. Wir verifizieren die Action-Logik (Empfaenger-Resolution,
// RLS-Check, Rate-Limit, Audit-Log, Filename), NICHT die echte SMTP-/PDF-/
// Markdown-Pipeline (separate Tests).
//
// Test-Faelle:
//   1. validRequest (self+partner+additional)            -> ok=true, sendMail Args verifiziert
//   2. RLS-Reject (foreign tenant)                       -> forbidden
//   3. Rate-Limit (6. Versuch in derselben Stunde)       -> rate_limit_exceeded
//   4. customMessage wird an buildDiagnoseReportEmail propagiert
//   5. additionalEmail invalid format                    -> invalid_additional_email
//   6. attachment-Filename "diagnose-bericht-YYYY-MM-DD.pdf"
//   7. Audit-Log captureInfo mit recipients_count + category=diagnose_report_emailed
//   8. no_recipients (alle 3 false)                      -> no_recipients
//   9. custom_message_too_long (>500 chars)              -> custom_message_too_long

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  captureInfoMock: vi.fn(),
  sendMailMock: vi.fn(async () => {}),
  loadEmailOverridesMapMock: vi.fn(async () => new Map<string, string>()),
  renderDiagnoseReportPdfMock: vi.fn(async () => Buffer.from("%PDF-fake-content%%EOF")),
  buildDiagnoseReportEmailMock: vi.fn(async () => ({
    subject: "Ihr StrategAIze Diagnose-Bericht — Kanzlei Mueller",
    htmlBody: "<p>HTML</p>",
    textBody: "TEXT",
  })),
  resolveBrandingForTenantMock: vi.fn(async () => ({
    displayName: "Kanzlei Mueller",
    logoUrl: null,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));
vi.mock("@/lib/logger", () => ({
  captureException: mocks.captureExceptionMock,
  captureInfo: mocks.captureInfoMock,
  captureWarning: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendMail: mocks.sendMailMock,
  loadEmailOverridesMap: mocks.loadEmailOverridesMapMock,
}));
vi.mock("@/lib/pdf/diagnose-report", () => ({
  renderDiagnoseReportPdf: mocks.renderDiagnoseReportPdfMock,
}));
vi.mock("@/lib/email/templates/diagnose-report", () => ({
  buildDiagnoseReportEmail: mocks.buildDiagnoseReportEmailMock,
}));
vi.mock("@/lib/branding/resolve", () => ({
  resolveBrandingForTenant: mocks.resolveBrandingForTenantMock,
  STRATEGAIZE_DEFAULT_BRANDING: {
    displayName: "StrategAIze",
    logoUrl: null,
  },
}));

import { sendDiagnoseReportByEmail } from "../actions";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const FOREIGN_TENANT_ID = "33333333-3333-3333-3333-333333333333";
const TEMPLATE_ID = "44444444-4444-4444-4444-444444444444";
const PARTNER_TENANT_ID = "55555555-5555-5555-5555-555555555555";

// Eindeutige Session-IDs pro Test, weil der Rate-Limiter prozess-global ist.
function makeSessionId(suffix: string): string {
  // UUID-Format: 8-4-4-4-12 hex chars.
  return `aaaaaaaa-aaaa-aaaa-aaaa-${suffix.padStart(12, "0")}`;
}

interface BuildOpts {
  sessionId: string;
  sessionTenantId?: string;
  sessionStatus?: string;
  templateMissing?: boolean;
  parentPartnerTenantId?: string | null;
  partnerOrgContactEmail?: string | null;
  partnerOrgDisplayName?: string | null;
  noProfile?: boolean;
}

function buildUserClient() {
  const getUser = vi.fn(async () => ({
    data: { user: { id: USER_ID, email: "mandant@example.com" } },
  }));
  return Promise.resolve({ auth: { getUser } });
}

function buildAdminClient(opts: BuildOpts) {
  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.noProfile
                ? null
                : {
                    id: USER_ID,
                    tenant_id: TENANT_ID,
                    email: "mandant@example.com",
                    role: "tenant_admin",
                  },
              error: opts.noProfile ? { message: "not found" } : null,
            }),
          }),
        }),
      };
    }
    if (table === "capture_session") {
      // V7.2 sendDiagnoseReportByEmail nutzt maybeSingle fuer die Session-
      // Lookup (~Z. 96). V8 SLC-152 MT-1 fuegt einen Parallel-Query
      // .select("metadata") + .single() im Promise.all hinzu. Mock muss beide
      // Termina-Chains liefern.
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: opts.sessionId,
                tenant_id: opts.sessionTenantId ?? TENANT_ID,
                template_id: TEMPLATE_ID,
                status: opts.sessionStatus ?? "finalized",
                updated_at: "2026-05-22T10:00:00.000Z",
              },
              error: null,
            }),
            single: async () => ({
              data: {
                // V7.2-Tests laufen gegen V6.3-Template (kein usage_kind), das
                // metadata-Feld bleibt darum leer. V8-Path wird in
                // SLC-152-Vitest separat abgedeckt (mandanten-report-v8.test).
                metadata: {},
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                opts.parentPartnerTenantId === null
                  ? { parent_partner_tenant_id: null, tenant_kind: "direct_client" }
                  : {
                      parent_partner_tenant_id:
                        opts.parentPartnerTenantId ?? PARTNER_TENANT_ID,
                      tenant_kind: "partner_client",
                      name: "Mandant GmbH",
                    },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "partner_organization") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                opts.partnerOrgContactEmail === undefined &&
                opts.partnerOrgDisplayName === undefined
                  ? {
                      contact_email: "partner@kanzlei.example",
                      display_name: "Kanzlei Mueller",
                    }
                  : {
                      contact_email: opts.partnerOrgContactEmail ?? null,
                      display_name: opts.partnerOrgDisplayName ?? "Kanzlei Mueller",
                    },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "template") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.templateMissing
                ? null
                : {
                    name: "partner_diagnostic",
                    blocks: [
                      { key: "b1", title: "Block 1", intro: "Intro 1", order: 1 },
                      { key: "b2", title: "Block 2", intro: "Intro 2", order: 2 },
                    ],
                    metadata: {
                      required_closing_statement: "Pflicht-Aussage hier.",
                    },
                  },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "knowledge_unit") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    block_key: "b1",
                    title: "Block 1",
                    body: "Body 1",
                    metadata: { score: 75, comment: "Kommentar 1" },
                    created_at: "2026-05-22T09:00:00.000Z",
                  },
                  {
                    block_key: "b2",
                    title: "Block 2",
                    body: "Body 2",
                    metadata: { score: 50, comment: "Kommentar 2" },
                    created_at: "2026-05-22T09:05:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected admin-client from(${table})`);
  });
  return { from: fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendMailMock.mockResolvedValue(undefined);
  mocks.loadEmailOverridesMapMock.mockResolvedValue(new Map());
  mocks.renderDiagnoseReportPdfMock.mockResolvedValue(
    Buffer.from("%PDF-fake-content%%EOF"),
  );
  mocks.buildDiagnoseReportEmailMock.mockResolvedValue({
    subject: "Ihr StrategAIze Diagnose-Bericht — Kanzlei Mueller",
    htmlBody: "<p>HTML</p>",
    textBody: "TEXT",
  });
  mocks.resolveBrandingForTenantMock.mockResolvedValue({
    displayName: "Kanzlei Mueller",
    logoUrl: null,
  });
});

describe("sendDiagnoseReportByEmail", () => {
  it("1. validRequest sendet Email mit korrekten to+cc+attachment", async () => {
    const sessionId = makeSessionId("100000000001");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: true,
      additionalEmail: "partner-secondary@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipientsCount).toBe(3);
    expect(mocks.sendMailMock).toHaveBeenCalledTimes(1);

    const calls = mocks.sendMailMock.mock.calls as unknown as Array<
      Array<{
        to: string[];
        cc?: string[];
        subject: string;
        attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
      }>
    >;
    const sendMailCall = calls[0][0];
    expect(sendMailCall.to).toEqual([
      "mandant@example.com",
      "partner-secondary@example.com",
    ]);
    expect(sendMailCall.cc).toEqual(["partner@kanzlei.example"]);
    expect(sendMailCall.subject).toBe(
      "Ihr StrategAIze Diagnose-Bericht — Kanzlei Mueller",
    );
    expect(sendMailCall.attachments).toHaveLength(1);
    expect(sendMailCall.attachments[0].contentType).toBe("application/pdf");
    expect(sendMailCall.attachments[0].content).toBeInstanceOf(Buffer);
  });

  it("2. RLS-Reject bei foreign tenant", async () => {
    const sessionId = makeSessionId("200000000002");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ sessionId, sessionTenantId: FOREIGN_TENANT_ID }),
    );

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
    expect(mocks.sendMailMock).not.toHaveBeenCalled();
  });

  it("3. Rate-Limit: 6. Versuch in derselben Stunde wird rejected", async () => {
    const sessionId = makeSessionId("300000000003");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    // 5 erlaubte Versuche
    for (let i = 0; i < 5; i++) {
      const r = await sendDiagnoseReportByEmail({
        captureSessionId: sessionId,
        recipientToSelf: true,
        recipientToPartner: false,
      });
      expect(r.ok).toBe(true);
    }
    // 6. Versuch faellt durch
    const sixth = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: false,
    });
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) {
      expect(sixth.error).toBe("rate_limit_exceeded");
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(mocks.sendMailMock).toHaveBeenCalledTimes(5);
  });

  it("4. customMessage wird an buildDiagnoseReportEmail propagiert", async () => {
    const sessionId = makeSessionId("400000000004");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: false,
      customMessage: "  Bitte vorab pruefen.  ",
    });

    expect(result.ok).toBe(true);
    expect(mocks.buildDiagnoseReportEmailMock).toHaveBeenCalledWith(
      expect.any(Map),
      expect.objectContaining({
        partnerDisplayName: "Kanzlei Mueller",
        customMessage: "Bitte vorab pruefen.",
      }),
    );
  });

  it("5. additionalEmail mit invalid Format wird rejected", async () => {
    const sessionId = makeSessionId("500000000005");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: false,
      recipientToPartner: false,
      additionalEmail: "kein-email",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_additional_email");
    expect(mocks.sendMailMock).not.toHaveBeenCalled();
  });

  it("6. attachment-Filename folgt 'diagnose-bericht-YYYY-MM-DD.pdf'", async () => {
    const sessionId = makeSessionId("600000000006");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: false,
    });

    const calls = mocks.sendMailMock.mock.calls as unknown as Array<
      Array<{ attachments: Array<{ filename: string }> }>
    >;
    const sendMailCall = calls[0][0];
    expect(sendMailCall.attachments[0].filename).toMatch(
      /^diagnose-bericht-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it("7. Audit-Log captureInfo mit category + recipients_count", async () => {
    const sessionId = makeSessionId("700000000007");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: true,
    });

    expect(mocks.captureInfoMock).toHaveBeenCalledTimes(1);
    const infoCall = mocks.captureInfoMock.mock.calls[0];
    expect(infoCall[0]).toMatch(/Diagnose-Bericht versendet/);
    expect(infoCall[1]).toMatchObject({
      source: "diagnose/bericht/sendDiagnoseReportByEmail",
      userId: USER_ID,
      metadata: expect.objectContaining({
        category: "diagnose_report_emailed",
        capture_session_id: sessionId,
        recipients_count: 2,
        recipient_to_self: true,
        recipient_to_partner: true,
        recipient_additional: false,
      }),
    });
  });

  it("8. no_recipients wenn alle drei Flags false sind", async () => {
    const sessionId = makeSessionId("800000000008");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: false,
      recipientToPartner: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_recipients");
    expect(mocks.sendMailMock).not.toHaveBeenCalled();
  });

  it("9. custom_message_too_long bei >500 Zeichen", async () => {
    const sessionId = makeSessionId("900000000009");
    mocks.userClientMock.mockImplementation(buildUserClient);
    mocks.adminClientMock.mockImplementation(() => buildAdminClient({ sessionId }));

    const result = await sendDiagnoseReportByEmail({
      captureSessionId: sessionId,
      recipientToSelf: true,
      recipientToPartner: false,
      customMessage: "x".repeat(501),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("custom_message_too_long");
    expect(mocks.sendMailMock).not.toHaveBeenCalled();
  });
});
