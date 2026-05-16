// V6.3 SLC-105 MT-6 — Vitest fuer Diagnose-Server-Actions.
//
// Sechs Tests gegen die drei Actions:
//   - startDiagnoseRun: redirect bei Erfolg, Throw bei Direct-Client-Tenant.
//   - saveDiagnoseDraft: idempotenter Merge, Tenant-Match-Guard,
//     submitted-Lock.
//   - submitDiagnoseRun: status=submitted + ai_jobs insert + redirect,
//     Rollback bei Job-INSERT-Fehler.
//
// Strategie: vi.mock fuer @/lib/supabase/server + @/lib/supabase/admin +
// next/navigation.redirect (throw als Sentinel).
//
// Ref: feedback_native_html_form_pattern.md, RPT-281.

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: damit die mocks VOR den vi.mock-Calls existieren (sonst
// "Cannot access X before initialization" wegen vi.mock-Hoisting).
const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation.redirect wirft intern eine spezielle Exception, die
    // der React-Renderer abfaengt. Wir simulieren das mit Sentinel-Throw.
    throw new Error(`__REDIRECT__:${url}`);
  }),
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
}));
const { redirectMock, userClientMock, adminClientMock } = mocks;

vi.mock("next/navigation", () => ({
  redirect: mocks.redirectMock,
}));

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));

import {
  startDiagnoseRun,
  saveDiagnoseDraft,
  submitDiagnoseRun,
} from "../actions";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const TEMPLATE = "33333333-3333-3333-3333-333333333333";
const SESSION = "44444444-4444-4444-4444-444444444444";

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?: { id: string; tenant_id: string; email: string; role: string } | null;
}

function buildUserClient(opts: UserClientOpts) {
  const getUser = vi.fn(async () => ({
    data: { user: opts.user ?? { id: USER, email: "mandant@example.com" } },
  }));
  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                opts.profile === undefined
                  ? {
                      id: USER,
                      tenant_id: TENANT,
                      email: "mandant@example.com",
                      role: "tenant_admin",
                    }
                  : opts.profile,
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected user-client from(${table})`);
  });
  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

interface AdminBuilderOpts {
  tenantKind?: string | null;
  template?: { id: string; version: string } | null;
  existingSession?: { id: string; status: string } | null;
  session?: {
    id: string;
    tenant_id: string;
    template_id: string;
    owner_user_id: string;
    status: string;
    answers: Record<string, string>;
  } | null;
  insertSessionResult?: { id: string } | null;
  insertJobResult?: { id: string } | null;
  insertJobError?: { message: string } | null;
  updateError?: { message: string } | null;
}

interface AdminTrace {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; where?: string }>;
  selects: Array<string>;
}

function buildAdminClient(opts: AdminBuilderOpts): {
  client: unknown;
  trace: AdminTrace;
} {
  const trace: AdminTrace = { inserts: [], updates: [], selects: [] };

  const fromImpl = vi.fn((table: string) => {
    trace.selects.push(table);

    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                opts.tenantKind === null
                  ? null
                  : { tenant_kind: opts.tenantKind ?? "partner_client" },
            }),
          }),
        }),
      };
    }
    if (table === "template") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.template ?? { id: TEMPLATE, version: "v1" },
                error: opts.template === null ? { message: "not found" } : null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "capture_session") {
      return {
        select: () => ({
          eq: (_col?: string, _val?: string) => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: opts.existingSession ?? null,
                    }),
                  }),
                }),
              }),
            }),
            single: async () => ({ data: opts.session ?? null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          trace.inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: opts.insertSessionResult ?? { id: SESSION },
                error: null,
              }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          trace.updates.push({ table, patch });
          return {
            eq: () => Promise.resolve({ error: opts.updateError ?? null }),
          };
        },
      };
    }
    if (table === "ai_jobs") {
      return {
        insert: (row: Record<string, unknown>) => {
          trace.inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: opts.insertJobResult ?? { id: "job-1" },
                error: opts.insertJobError ?? null,
              }),
            }),
          };
        },
      };
    }
    throw new Error(`unexpected admin-client from(${table})`);
  });

  return { client: { from: fromImpl }, trace };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------------------
// startDiagnoseRun
// ----------------------------------------------------------------------------

describe("startDiagnoseRun", () => {
  it("redirected zu /dashboard/diagnose/run/[id] mit neuer Session bei partner_client-Mandant", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      tenantKind: "partner_client",
      template: { id: TEMPLATE, version: "v1" },
      existingSession: null,
    });
    adminClientMock.mockImplementation(() => client);

    await expect(startDiagnoseRun()).rejects.toThrow(
      /__REDIRECT__:\/dashboard\/diagnose\/run\//,
    );
    const sessionInsert = trace.inserts.find((i) => i.table === "capture_session");
    expect(sessionInsert).toBeTruthy();
    expect(sessionInsert?.row).toMatchObject({
      tenant_id: TENANT,
      template_id: TEMPLATE,
      template_version: "v1",
      owner_user_id: USER,
      status: "open",
      capture_mode: "questionnaire",
      answers: {},
    });
  });

  it("re-used existierende Session statt zweite Anlegen", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      tenantKind: "partner_client",
      template: { id: TEMPLATE, version: "v1" },
      existingSession: { id: "existing-session", status: "in_progress" },
    });
    adminClientMock.mockImplementation(() => client);

    await expect(startDiagnoseRun()).rejects.toThrow(
      "__REDIRECT__:/dashboard/diagnose/run/existing-session",
    );
    const sessionInsert = trace.inserts.find((i) => i.table === "capture_session");
    expect(sessionInsert).toBeUndefined();
  });

  it("wirft Error bei Direkt-Kunden-Tenant (tenant_kind=direct_client)", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({ tenantKind: "direct_client" });
    adminClientMock.mockImplementation(() => client);

    await expect(startDiagnoseRun()).rejects.toThrow(
      /nur fuer Mandanten ueber Partner/,
    );
  });
});

// ----------------------------------------------------------------------------
// saveDiagnoseDraft
// ----------------------------------------------------------------------------

describe("saveDiagnoseDraft", () => {
  it("mergt Antwort in bestehende answers JSONB + setzt status=in_progress wenn open", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: TENANT,
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "open",
        answers: { "ki_reife.q1": "Mehr als 10" },
      },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await saveDiagnoseDraft(SESSION, "ki_reife.q2", "Eher zuverlassig");
    expect(result.error).toBeUndefined();

    const update = trace.updates.find((u) => u.table === "capture_session");
    expect(update?.patch.answers).toEqual({
      "ki_reife.q1": "Mehr als 10",
      "ki_reife.q2": "Eher zuverlassig",
    });
    expect(update?.patch.status).toBe("in_progress");
  });

  it("lehnt Save ab wenn Tenant nicht matched", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: "FOREIGN-TENANT",
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "open",
        answers: {},
      },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await saveDiagnoseDraft(SESSION, "ki_reife.q1", "x");
    expect(result.error).toBe("Kein Zugriff");
  });

  it("lehnt Save ab wenn Session bereits submitted/finalized", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: TENANT,
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "submitted",
        answers: {},
      },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await saveDiagnoseDraft(SESSION, "ki_reife.q1", "x");
    expect(result.error).toMatch(/bereits eingereicht/);
  });
});

// ----------------------------------------------------------------------------
// submitDiagnoseRun
// ----------------------------------------------------------------------------

describe("submitDiagnoseRun", () => {
  it("setzt status=submitted + ai_jobs INSERT + redirect zu /bericht-pending", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: TENANT,
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "in_progress",
        answers: { "ki_reife.q1": "x" },
      },
      insertJobResult: { id: "job-1" },
    });
    adminClientMock.mockImplementation(() => client);

    await expect(submitDiagnoseRun(SESSION)).rejects.toThrow(
      `__REDIRECT__:/dashboard/diagnose/${SESSION}/bericht-pending`,
    );

    const sessionUpdate = trace.updates.find((u) => u.table === "capture_session");
    expect(sessionUpdate?.patch.status).toBe("submitted");

    const jobInsert = trace.inserts.find((i) => i.table === "ai_jobs");
    expect(jobInsert?.row).toMatchObject({
      tenant_id: TENANT,
      job_type: "knowledge_unit_condensation",
      status: "pending",
      payload: {
        capture_session_id: SESSION,
        source_kind: "diagnose",
      },
    });
  });

  it("rolled capture_session.status zurueck wenn ai_jobs INSERT fehlschlaegt", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: TENANT,
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "in_progress",
        answers: { "ki_reife.q1": "x" },
      },
      insertJobResult: null,
      insertJobError: { message: "queue full" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await submitDiagnoseRun(SESSION);
    expect(result.error).toMatch(/Job-Enqueue fehlgeschlagen.*queue full/);

    // Erst submitted, dann zurueck auf in_progress.
    const sessionUpdates = trace.updates.filter((u) => u.table === "capture_session");
    expect(sessionUpdates).toHaveLength(2);
    expect(sessionUpdates[0].patch.status).toBe("submitted");
    expect(sessionUpdates[1].patch.status).toBe("in_progress");
  });

  it("lehnt Submit ab wenn keine Antworten erfasst", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({
      tenantKind: "partner_client",
      session: {
        id: SESSION,
        tenant_id: TENANT,
        template_id: TEMPLATE,
        owner_user_id: USER,
        status: "in_progress",
        answers: {},
      },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await submitDiagnoseRun(SESSION);
    expect(result.error).toBe("Keine Antworten erfasst");
  });
});
