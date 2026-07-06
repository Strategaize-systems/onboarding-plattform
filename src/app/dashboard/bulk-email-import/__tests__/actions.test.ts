// V9 SLC-165 MT-4 — Vitest fuer uploadBulkEmailRun Server-Action.
//
// Strategie: vi.mock fuer @/lib/supabase/server + @/lib/supabase/admin. Wir
// bauen kleine Trace-Aufnehmer fuer Inserts, Deletes und Storage-Aufrufe.
// Pattern aus src/app/dashboard/diagnose/__tests__/actions.test.ts (V6.3 SLC-105
// MT-6 / RPT-281 / [[feedback-native-html-form-pattern]]).
//
// Coverage:
//   1. Auth-Gate (8 Faelle: unauth, no-profile, employee, member, admin,
//      tenant_admin-no-tenant, tenant_admin-OK).
//   2. File-Validation (extension, size, empty, missing-field).
//   3. Duplicate-Check (existing run, db-error during check).
//   4. Happy Path (capture_session + storage + bulk_run + ai_jobs).
//   5. Fallback (no template -> capture_session_id null).
//   6. Rollback (Storage-Fail, bulk_run-INSERT-Fail, ai_jobs-INSERT-Fail).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
}));
const { userClientMock, adminClientMock } = mocks;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));

import { uploadBulkEmailRun } from "../actions";
import { computeFileHash } from "@/lib/bulk-email/file-hash";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const TEMPLATE = "33333333-3333-3333-3333-333333333333";
const RUN_ID = "44444444-4444-4444-4444-444444444444";
const CAPTURE_SESSION_ID = "55555555-5555-5555-5555-555555555555";

// ──────────────────────────────────────────────────────────────────────────────
// User-Client Mock
// ──────────────────────────────────────────────────────────────────────────────

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?:
    | { id: string; tenant_id: string | null; role: string }
    | null;
  profileError?: { message: string } | null;
}

function buildUserClient(opts: UserClientOpts) {
  const getUser = vi.fn(async () => ({
    data: {
      user:
        opts.user === undefined
          ? { id: USER, email: "gf@example.com" }
          : opts.user,
    },
  }));
  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                opts.profile === undefined
                  ? { id: USER, tenant_id: TENANT, role: "tenant_admin" }
                  : opts.profile,
              error: opts.profileError ?? null,
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected user-client from(${table})`);
  });
  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin-Client Mock
// ──────────────────────────────────────────────────────────────────────────────

interface AdminTrace {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  deletes: Array<{ table: string; id: string }>;
  storageUploads: Array<{
    bucket: string;
    path: string;
    contentType?: string;
  }>;
  storageRemovals: Array<{ bucket: string; paths: string[] }>;
}

interface AdminBuilderOpts {
  template?: { id: string; version: string } | null;
  templateError?: { message: string } | null;
  existingRun?: { id: string } | null;
  duplicateCheckError?: { message: string } | null;
  captureSessionInsertError?: { message: string } | null;
  storageUploadError?: { message: string } | null;
  bulkRunInsertResult?: { id: string } | null;
  bulkRunInsertError?: { message: string } | null;
  aiJobsInsertError?: { message: string } | null;
}

function buildAdminClient(opts: AdminBuilderOpts) {
  const trace: AdminTrace = {
    inserts: [],
    deletes: [],
    storageUploads: [],
    storageRemovals: [],
  };

  const fromImpl = vi.fn((table: string) => {
    if (table === "template") {
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data:
                  opts.template === undefined
                    ? { id: TEMPLATE, version: "1.0.0" }
                    : opts.template,
                error: opts.templateError ?? null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "capture_session") {
      return {
        insert: (row: Record<string, unknown>) => {
          trace.inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: opts.captureSessionInsertError
                  ? null
                  : { id: CAPTURE_SESSION_ID },
                error: opts.captureSessionInsertError ?? null,
              }),
            }),
          };
        },
        delete: () => ({
          eq: (_col: string, value: string) => {
            trace.deletes.push({ table, id: value });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "email_bulk_run") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.existingRun ?? null,
                error: opts.duplicateCheckError ?? null,
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          trace.inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: opts.bulkRunInsertError
                  ? null
                  : (opts.bulkRunInsertResult ?? { id: RUN_ID }),
                error: opts.bulkRunInsertError ?? null,
              }),
            }),
          };
        },
        delete: () => ({
          eq: (_col: string, value: string) => {
            trace.deletes.push({ table, id: value });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "ai_jobs") {
      return {
        insert: (row: Record<string, unknown>) => {
          trace.inserts.push({ table, row });
          return Promise.resolve({
            error: opts.aiJobsInsertError ?? null,
          });
        },
      };
    }
    throw new Error(`unexpected admin-client from(${table})`);
  });

  const storage = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(
        async (
          path: string,
          _buffer: unknown,
          options: { contentType?: string },
        ) => {
          trace.storageUploads.push({
            bucket,
            path,
            contentType: options?.contentType,
          });
          return { error: opts.storageUploadError ?? null };
        },
      ),
      remove: vi.fn(async (paths: string[]) => {
        trace.storageRemovals.push({ bucket, paths });
        return { error: null };
      }),
    })),
  };

  return { client: { from: fromImpl, storage }, trace };
}

// ──────────────────────────────────────────────────────────────────────────────
// File-Helper
// ──────────────────────────────────────────────────────────────────────────────

function makeMboxFile(name = "history.mbox", content = "From x\nSubject: a\n\nbody"): File {
  const blob = new Blob([content], { type: "application/mbox" });
  return new File([blob], name, { type: "application/mbox" });
}

function makeFormDataWithFile(file: File): FormData {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// 1. Auth-Gate
// ============================================================================

describe("uploadBulkEmailRun — Auth-Gate", () => {
  it("lehnt nicht-authentifizierte User ab", async () => {
    userClientMock.mockImplementation(() => buildUserClient({ user: null }));
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result).toEqual({ ok: false, error: "Nicht authentifiziert" });
  });

  it("lehnt User ohne Profile ab", async () => {
    userClientMock.mockImplementation(() => buildUserClient({ profile: null }));
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result).toEqual({ ok: false, error: "Profil nicht gefunden" });
  });

  it("lehnt role=employee ab", async () => {
    userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: TENANT, role: "employee" },
      }),
    );
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Nur Tenant-Admins/);
    }
  });

  it("lehnt role=strategaize_admin ab (kein Cross-Tenant-Upload)", async () => {
    userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: TENANT, role: "strategaize_admin" },
      }),
    );
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Nur Tenant-Admins/);
    }
  });

  it("lehnt tenant_admin ohne tenant_id ab", async () => {
    userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: null, role: "tenant_admin" },
      }),
    );
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result).toEqual({ ok: false, error: "Kein Tenant zugeordnet" });
  });
});

// ============================================================================
// 2. File-Validation
// ============================================================================

describe("uploadBulkEmailRun — File-Validation", () => {
  it("lehnt formData ohne 'file'-Feld ab", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const result = await uploadBulkEmailRun(new FormData());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/file/i);
    }
  });

  it("lehnt leere Datei ab", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const emptyFile = new File([new Blob([])], "empty.mbox", {
      type: "application/mbox",
    });
    const result = await uploadBulkEmailRun(makeFormDataWithFile(emptyFile));
    expect(result).toEqual({ ok: false, error: "Datei ist leer" });
  });

  it("lehnt falsche Extension (.pdf) ab", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    adminClientMock.mockImplementation(() => buildAdminClient({}).client);

    const pdf = new File([new Blob(["%PDF"])], "report.pdf", {
      type: "application/pdf",
    });
    const result = await uploadBulkEmailRun(makeFormDataWithFile(pdf));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/.mbox.*.eml/);
    }
  });

  it("akzeptiert .eml-Extension", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({});
    adminClientMock.mockImplementation(() => client);

    const eml = new File([new Blob(["Subject: test\n\nbody"])], "msg.eml", {
      type: "message/rfc822",
    });
    const result = await uploadBulkEmailRun(makeFormDataWithFile(eml));
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// 3. Duplicate-Check
// ============================================================================

describe("uploadBulkEmailRun — Duplicate-Check", () => {
  it("liefert duplicate=true bei vorhandenem (tenant_id, file_hash)", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      existingRun: { id: "existing-run-id" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(
      makeFormDataWithFile(makeMboxFile("history.mbox", "From x\nSubject: a\n\nbody")),
    );
    expect(result).toEqual({ ok: true, runId: "existing-run-id", duplicate: true });
    // Kein Storage-Upload + kein Insert in Duplicate-Pfad.
    expect(trace.storageUploads).toHaveLength(0);
    expect(trace.inserts.find((i) => i.table === "email_bulk_run")).toBeUndefined();
  });

  it("liefert Error bei DB-Fehler waehrend Duplicate-Check", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client } = buildAdminClient({
      duplicateCheckError: { message: "connection lost" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Duplicate-Check/);
    }
  });
});

// ============================================================================
// 4. Happy Path
// ============================================================================

describe("uploadBulkEmailRun — Happy Path", () => {
  it("erzeugt capture_session + Storage-Put + email_bulk_run + ai_jobs", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({});
    adminClientMock.mockImplementation(() => client);

    const file = makeMboxFile("history.mbox", "From a\nSubject: x\n\nbody");
    const expectedHash = computeFileHash(
      Buffer.from(await file.arrayBuffer()),
    );

    const result = await uploadBulkEmailRun(makeFormDataWithFile(file));

    expect(result).toEqual({ ok: true, runId: RUN_ID, duplicate: false });

    // capture_session INSERT mit capture_mode='email_bulk'
    const captureInsert = trace.inserts.find((i) => i.table === "capture_session");
    expect(captureInsert?.row).toMatchObject({
      tenant_id: TENANT,
      template_id: TEMPLATE,
      template_version: "1.0.0",
      owner_user_id: USER,
      status: "in_progress",
      capture_mode: "email_bulk",
      answers: {},
    });

    // Storage-PUT mit Pfad {tenant}/{hash}/{safe_name}
    expect(trace.storageUploads).toHaveLength(1);
    expect(trace.storageUploads[0]).toMatchObject({
      bucket: "bulk-email",
      path: `${TENANT}/${expectedHash}/history.mbox`,
      contentType: "application/mbox",
    });

    // email_bulk_run INSERT mit capture_session_id verknuepft
    const bulkInsert = trace.inserts.find((i) => i.table === "email_bulk_run");
    expect(bulkInsert?.row).toMatchObject({
      tenant_id: TENANT,
      uploader_user_id: USER,
      capture_session_id: CAPTURE_SESSION_ID,
      source_file_name: "history.mbox",
      file_hash: expectedHash,
      storage_path: `${TENANT}/${expectedHash}/history.mbox`,
      status: "uploaded",
    });

    // ai_jobs INSERT mit job_type='email_bulk_parse' + bulk_run_id
    const jobInsert = trace.inserts.find((i) => i.table === "ai_jobs");
    expect(jobInsert?.row).toMatchObject({
      tenant_id: TENANT,
      job_type: "email_bulk_parse",
      status: "pending",
      payload: { bulk_run_id: RUN_ID },
    });
  });

  it("laeuft ohne capture_session_id wenn KEIN Template existiert", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({ template: null });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(true);

    // Kein capture_session INSERT
    expect(
      trace.inserts.find((i) => i.table === "capture_session"),
    ).toBeUndefined();

    // bulk_run mit capture_session_id=null
    const bulkInsert = trace.inserts.find((i) => i.table === "email_bulk_run");
    expect(bulkInsert?.row.capture_session_id).toBeNull();
  });
});

// ============================================================================
// 5. Rollback
// ============================================================================

describe("uploadBulkEmailRun — Rollback", () => {
  it("loescht capture_session wenn Storage-Upload fehlschlaegt", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      storageUploadError: { message: "bucket not found" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);

    // capture_session wurde geloescht
    expect(
      trace.deletes.find((d) => d.table === "capture_session"),
    ).toMatchObject({ id: CAPTURE_SESSION_ID });

    // email_bulk_run wurde NICHT angelegt
    expect(
      trace.inserts.find((i) => i.table === "email_bulk_run"),
    ).toBeUndefined();
  });

  it("loescht capture_session + Storage-Object wenn email_bulk_run INSERT fehlschlaegt", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      bulkRunInsertError: { message: "23505 duplicate key" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);

    expect(trace.storageRemovals).toHaveLength(1);
    expect(trace.storageRemovals[0].bucket).toBe("bulk-email");

    expect(
      trace.deletes.find((d) => d.table === "capture_session"),
    ).toBeTruthy();
  });

  it("loescht email_bulk_run + Storage-Object + capture_session wenn ai_jobs INSERT fehlschlaegt", async () => {
    userClientMock.mockImplementation(() => buildUserClient({}));
    const { client, trace } = buildAdminClient({
      aiJobsInsertError: { message: "ai_jobs FK violation" },
    });
    adminClientMock.mockImplementation(() => client);

    const result = await uploadBulkEmailRun(makeFormDataWithFile(makeMboxFile()));
    expect(result.ok).toBe(false);

    expect(
      trace.deletes.find((d) => d.table === "email_bulk_run"),
    ).toMatchObject({ id: RUN_ID });
    expect(trace.storageRemovals).toHaveLength(1);
    expect(
      trace.deletes.find((d) => d.table === "capture_session"),
    ).toBeTruthy();
  });
});
