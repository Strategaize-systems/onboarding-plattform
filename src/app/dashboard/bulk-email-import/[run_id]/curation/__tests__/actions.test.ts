// V9 SLC-167 MT-6 — Vitest fuer Curation Server-Actions (FEAT-073)
// V9.5 SLC-V9.5-D MT-1..3 — Curation-Contract-Shift (DEC-214): Actions
//   operieren auf email_synthesized_unit; finishCuration-Guard akzeptiert
//   'synthesized'/'curating' (AC-D-4); importToHandbook OHNE Pseudonym-Lookup
//   (AC-D-2).
//
// Coverage:
//   updateUnitCuration: Auth-Gate, UUID, invalid status, section-Pflicht,
//                       edited-Title/Description-Validation, success
//   bulkAcceptUnits: Auth-Gate, UUID, threshold-Range, 0 candidates, success
//   bulkRejectAllUnits: Auth-Gate, UUID, success
//   finishCurationAndStartHandbookImport: Auth-Gate, UUID, status-Pre-Check
//                                          (synthesized/curating, AC-D-4),
//                                          0-accepted-Block, success
//   importToHandbook: Units -> knowledge_unit ohne email_thread-Lookup
//
// Pattern aus ../pattern-start/__tests__/actions.test.ts: vi.mock fuer
// Supabase-Server + next/cache. Section-Lookup wird in updateUnitCuration
// + bulkAcceptUnits nicht aufgerufen — kein Section-Store-Mock noetig.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));

import {
  bulkAcceptUnits,
  bulkRejectAllUnits,
  finishCurationAndStartHandbookImport,
  importToHandbook,
  updateUnitCuration,
} from "../actions";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "33333333-3333-3333-3333-333333333333";
const UNIT_ID_1 = "44444444-4444-4444-4444-444444444444";
const UNIT_ID_2 = "55555555-5555-5555-5555-555555555555";

// ──────────────────────────────────────────────────────────────────────────────
// User-Client Mock-Builder
// ──────────────────────────────────────────────────────────────────────────────

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?: { id: string; tenant_id: string | null; role: string } | null;
  profileError?: { message: string } | null;
  /** email_synthesized_unit UPDATE result */
  unitUpdate?: {
    data?: { id: string; bulk_run_id: string } | null;
    error?: { message: string } | null;
  };
  /** email_synthesized_unit bulk-SELECT candidates */
  bulkCandidates?: Array<{ id: string; suggested_section: string }>;
  bulkCandidatesError?: { message: string } | null;
  /** email_synthesized_unit bulk-UPDATE error */
  bulkUpdateError?: { message: string } | null;
  bulkUpdateCount?: number;
  /** email_bulk_run SELECT for finish */
  runRow?: { id: string; status: string } | null;
  runError?: { message: string } | null;
  /** email_synthesized_unit accepted-count for finish */
  acceptedCount?: number | null;
  countError?: { message: string } | null;
  /** email_bulk_run UPDATE for finish */
  runUpdateError?: { message: string } | null;
  /** UPDATE tracking */
  updateTracker?: Array<{ table: string; patch: Record<string, unknown> }>;
  /** Bulk-UPDATE invocation tracker */
  bulkUpdateInvocations?: number;
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

    if (table === "email_synthesized_unit") {
      return {
        // updateUnitCuration: update(...).eq(id).select(...).maybeSingle()
        update: (patch: Record<string, unknown>, options?: { count?: string }) => {
          opts.updateTracker?.push({ table, patch });

          // bulk-UPDATE path: update(...).eq(id).eq(curation_status, ...)
          //                   returns { error, count }
          // single-row UPDATE path: update(...).eq(id).select(...).maybeSingle()
          if (options?.count === "exact") {
            opts.bulkUpdateInvocations = (opts.bulkUpdateInvocations ?? 0) + 1;
            return {
              eq: () => ({
                eq: async () => ({
                  error: opts.bulkUpdateError ?? null,
                  count: opts.bulkUpdateCount ?? 1,
                }),
                // also support .eq(bulk_run_id) chain for bulkRejectAll
                then: undefined,
              }),
            };
          }

          // updateUnitCuration: update(...).eq(...).select(...).maybeSingle()
          const defaultData = { id: UNIT_ID_1, bulk_run_id: RUN_ID };
          const data =
            opts.unitUpdate === undefined
              ? defaultData
              : opts.unitUpdate.data ?? null;
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data,
                  error: opts.unitUpdate?.error ?? null,
                }),
              }),
            }),
          };
        },

        // bulkAcceptUnits SELECT: select(...).eq().eq().not().gte()
        // finishCurationAndStartHandbookImport COUNT: select(..., {count:'exact', head:true}).eq().in()
        select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
          if (selectOpts?.head === true) {
            // Count-Query fuer finishCurationAndStartHandbookImport
            return {
              eq: () => ({
                in: async () => ({
                  count: opts.acceptedCount ?? 0,
                  error: opts.countError ?? null,
                }),
              }),
            };
          }
          // Bulk-Select fuer bulkAcceptUnits
          return {
            eq: () => ({
              eq: () => ({
                not: () => ({
                  gte: async () => ({
                    data: opts.bulkCandidates ?? [],
                    error: opts.bulkCandidatesError ?? null,
                  }),
                }),
              }),
            }),
          };
        },
      };
    }

    if (table === "email_bulk_run") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.runRow ?? null,
              error: opts.runError ?? null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          opts.updateTracker?.push({ table, patch });
          return {
            eq: async () => ({
              error: opts.runUpdateError ?? null,
            }),
          };
        },
      };
    }

    throw new Error(`unexpected user-client from(${table})`);
  });

  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

// Bulk-Reject-all-Units-UPDATE uses different chain: update(...).eq(bulk_run_id).eq(curation_status)
// Already covered via the bulk-UPDATE branch above (count:'exact').

beforeEach(() => {
  mocks.revalidatePathMock.mockReset();
  mocks.userClientMock.mockReset();
  mocks.adminClientMock.mockReset();
  mocks.adminClientMock.mockImplementation(() => ({}));
});

// ──────────────────────────────────────────────────────────────────────────────
// updateUnitCuration
// ──────────────────────────────────────────────────────────────────────────────

describe("updateUnitCuration — Auth-Gate", () => {
  it("rejects unauthenticated user", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({ user: null }));
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
      curated_section: "prozesse",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Nicht authentifiziert/);
  });

  it("rejects employee role", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: TENANT, role: "employee" },
      }),
    );
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
      curated_section: "prozesse",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Tenant-Admins/);
  });
});

describe("updateUnitCuration — Validation", () => {
  beforeEach(() => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
  });

  it("rejects invalid UUID", async () => {
    const result = await updateUnitCuration("not-uuid", {
      status: "accepted",
      curated_section: "prozesse",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unit_id/);
  });

  it("rejects invalid status", async () => {
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "weird" as never,
      curated_section: "prozesse",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/curation_status/);
  });

  it("requires section on status=accepted", async () => {
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Section/);
  });

  it("rejects sentinel as curated_section", async () => {
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
      curated_section: "__other__",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Sentinel/i);
  });

  it("rejects empty edited_title on status=edited", async () => {
    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "edited",
      curated_section: "prozesse",
      edited_title: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/edited_title/);
  });
});

describe("updateUnitCuration — Success", () => {
  it("accepts pattern with section + records curator + timestamp", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ updateTracker: tracker }),
    );

    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
      curated_section: "prozesse_und_ablaeufe",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unitId).toBe(UNIT_ID_1);
    expect(tracker[0].patch.curation_status).toBe("accepted");
    expect(tracker[0].patch.curated_section).toBe("prozesse_und_ablaeufe");
    expect(tracker[0].patch.curator_user_id).toBe(USER);
    expect(tracker[0].patch.curated_at).toBeDefined();
    expect(mocks.revalidatePathMock).toHaveBeenCalled();
  });

  it("edits pattern with title+description+section", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ updateTracker: tracker }),
    );

    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "edited",
      curated_section: "prozesse",
      edited_title: "Bessere Titel",
      edited_description: "Bessere Beschreibung",
    });

    expect(result.ok).toBe(true);
    expect(tracker[0].patch.curation_status).toBe("edited");
    expect(tracker[0].patch.title).toBe("Bessere Titel");
    expect(tracker[0].patch.description).toBe("Bessere Beschreibung");
    expect(tracker[0].patch.curated_section).toBe("prozesse");
  });

  it("rejects pattern without section requirement", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ updateTracker: tracker }),
    );

    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "rejected",
    });

    expect(result.ok).toBe(true);
    expect(tracker[0].patch.curation_status).toBe("rejected");
    // curated_section is NOT in the patch when undefined (only set if provided)
    expect("curated_section" in tracker[0].patch).toBe(false);
  });

  it("returns error when RLS blocks UPDATE (no row returned)", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ unitUpdate: { data: null } }),
    );

    const result = await updateUnitCuration(UNIT_ID_1, {
      status: "accepted",
      curated_section: "prozesse",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/RLS-Block|nicht gefunden/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// bulkAcceptUnits
// ──────────────────────────────────────────────────────────────────────────────

describe("bulkAcceptUnits", () => {
  it("rejects invalid UUID", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const result = await bulkAcceptUnits("not-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bulk_run_id/);
  });

  it("rejects threshold out of range", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const r1 = await bulkAcceptUnits(RUN_ID, { confidenceThreshold: 1.5 });
    expect(r1.ok).toBe(false);
    const r2 = await bulkAcceptUnits(RUN_ID, { confidenceThreshold: -0.1 });
    expect(r2.ok).toBe(false);
  });

  it("returns 0 when no candidates qualify", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ bulkCandidates: [] }),
    );
    const result = await bulkAcceptUnits(RUN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.acceptedCount).toBe(0);
  });

  it("accepts each candidate with suggested_section as curated_section", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        bulkCandidates: [
          { id: UNIT_ID_1, suggested_section: "prozesse" },
          { id: UNIT_ID_2, suggested_section: "fuehrung" },
        ],
        bulkUpdateCount: 1,
        updateTracker: tracker,
      }),
    );

    const result = await bulkAcceptUnits(RUN_ID, { confidenceThreshold: 0.8 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.acceptedCount).toBe(2);

    expect(tracker.length).toBe(2);
    expect(tracker[0].patch.curated_section).toBe("prozesse");
    expect(tracker[0].patch.curation_status).toBe("accepted");
    expect(tracker[0].patch.curator_user_id).toBe(USER);
    expect(tracker[1].patch.curated_section).toBe("fuehrung");
  });

  it("aborts on first UPDATE error and reports partial count", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        bulkCandidates: [{ id: UNIT_ID_1, suggested_section: "prozesse" }],
        bulkUpdateError: { message: "permission denied" },
      }),
    );
    const result = await bulkAcceptUnits(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permission denied/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// bulkRejectAll
// ──────────────────────────────────────────────────────────────────────────────

describe("bulkRejectAllUnits", () => {
  it("rejects invalid UUID", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const result = await bulkRejectAllUnits("not-uuid");
    expect(result.ok).toBe(false);
  });

  it("updates all pending patterns and reports count", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ bulkUpdateCount: 7, updateTracker: tracker }),
    );
    const result = await bulkRejectAllUnits(RUN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rejectedCount).toBe(7);
    expect(tracker[0].patch.curation_status).toBe("rejected");
    expect(tracker[0].patch.curator_user_id).toBe(USER);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// finishCurationAndStartHandbookImport
// ──────────────────────────────────────────────────────────────────────────────

describe("finishCurationAndStartHandbookImport", () => {
  it("rejects invalid UUID", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const result = await finishCurationAndStartHandbookImport("not-uuid");
    expect(result.ok).toBe(false);
  });

  it("rejects when bulk-run not found", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ runRow: null }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nicht gefunden/);
  });

  it("rejects wrong status", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ runRow: { id: RUN_ID, status: "thread_redacted" } }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Status/);
  });

  it("rejects status='pattern_extracted' (Curation erst nach Synthese, AC-D-4)", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ runRow: { id: RUN_ID, status: "pattern_extracted" } }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/synthesized/);
  });

  it("rejects when no accepted/edited unit exists", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "synthesized" },
        acceptedCount: 0,
      }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Keine akzeptierte/);
  });

  it("flips status to importing from 'synthesized' (AC-D-4)", async () => {
    const tracker: Array<{ table: string; patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "synthesized" },
        acceptedCount: 5,
        updateTracker: tracker,
      }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handbookImportStarted).toBe(false);
      expect(result.pendingMessage).toMatch(/importToHandbook/);
    }
    const runUpdate = tracker.find((t) => t.table === "email_bulk_run");
    expect(runUpdate?.patch.status).toBe("importing");
  });

  it("accepts status='curating' as valid pre-condition", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "curating" },
        acceptedCount: 3,
      }),
    );
    const result = await finishCurationAndStartHandbookImport(RUN_ID);
    expect(result.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// importToHandbook (SLC-168 MT-2)
// ──────────────────────────────────────────────────────────────────────────────

const CAPTURE_SESSION_ID = "88888888-8888-8888-8888-888888888888";
const SNAPSHOT_ID = "99999999-9999-9999-9999-999999999999";

interface AdminMockOpts {
  /** email_bulk_run.select() result */
  runRow?: {
    id: string;
    tenant_id: string;
    capture_session_id: string | null;
    source_file_name: string;
    status: string;
  } | null;
  runError?: { message: string } | null;
  /** Unit-Liste fuer email_synthesized_unit.select() */
  units?: Array<{
    id: string;
    title: string;
    description: string;
    evidence_snippets: unknown[] | null;
    themes: string[] | null;
    aggregated_confidence: number;
    evidence_count: number;
    source_pattern_ids: string[] | null;
    curated_section: string;
    created_at: string;
    curator_user_id: string | null;
  }>;
  unitsError?: { message: string } | null;
  /** Existierender Pseudo-Checkpoint? */
  existingCheckpointId?: string | null;
  /** Neu erzeugte Checkpoint-ID bei INSERT */
  newCheckpointId?: string;
  /** Block-Checkpoint INSERT error */
  blockCheckpointInsertError?: { message: string } | null;
  /** knowledge_unit INSERT generator — liefert pro Aufruf eine neue ID */
  knowledgeUnitIds?: string[];
  /** Index in knowledgeUnitIds bei dem INSERT failed */
  knowledgeUnitInsertFailIndex?: number;
  /** RPC rpc_trigger_handbook_snapshot result */
  rpcResult?: Record<string, unknown> | null;
  rpcError?: { message: string } | null;
  /** Tracker fuer alle bulk_run-UPDATEs */
  bulkRunUpdates?: Array<Record<string, unknown>>;
  /** Tracker fuer unit-Updates */
  unitUpdates?: Array<{ id: string; patch: Record<string, unknown> }>;
  /** Tracker fuer Bulk-unit-Updates via .in() (Rollback-Pfad) */
  unitBulkUpdates?: Array<{ ids: string[]; patch: Record<string, unknown> }>;
  /** Tracker fuer knowledge_unit-INSERTs */
  knowledgeUnitInserts?: Array<Record<string, unknown>>;
  /** Tracker fuer knowledge_unit-DELETEs (Rollback-Pfad) */
  knowledgeUnitDeletes?: Array<string[]>;
  /** Tracker fuer RPC-Calls */
  rpcCalls?: Array<{ fn: string; params: Record<string, unknown> }>;
}

function buildAdminClientForImport(opts: AdminMockOpts) {
  let kuInsertIndex = 0;

  return {
    from(table: string) {
      if (table === "email_bulk_run") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.runRow ?? null,
                error: opts.runError ?? null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            opts.bulkRunUpdates?.push(patch);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === "email_synthesized_unit") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                is: () => ({
                  not: async () => ({
                    data: opts.units ?? [],
                    error: opts.unitsError ?? null,
                  }),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (col: string, val: string) => {
              opts.unitUpdates?.push({ id: val, patch });
              return { error: null };
            },
            in: async (col: string, ids: string[]) => {
              opts.unitBulkUpdates?.push({ ids, patch });
              return { error: null };
            },
          }),
        };
      }

      if (table === "block_checkpoint") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () =>
                    opts.existingCheckpointId
                      ? { data: { id: opts.existingCheckpointId }, error: null }
                      : { data: null, error: null },
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () =>
                opts.blockCheckpointInsertError
                  ? {
                      data: null,
                      error: opts.blockCheckpointInsertError,
                    }
                  : {
                      data: { id: opts.newCheckpointId ?? "ck-default" },
                      error: null,
                    },
            }),
          }),
        };
      }

      if (table === "knowledge_unit") {
        return {
          insert: (row: Record<string, unknown>) => {
            const currentIndex = kuInsertIndex;
            kuInsertIndex += 1;
            return {
              select: () => ({
                single: async () => {
                  if (
                    opts.knowledgeUnitInsertFailIndex !== undefined &&
                    currentIndex === opts.knowledgeUnitInsertFailIndex
                  ) {
                    return {
                      data: null,
                      error: { message: "simulated ku-insert-error" },
                    };
                  }
                  opts.knowledgeUnitInserts?.push(row);
                  const id = opts.knowledgeUnitIds?.[currentIndex] ?? `ku-${currentIndex}`;
                  return { data: { id }, error: null };
                },
              }),
            };
          },
          delete: () => ({
            in: async (col: string, ids: string[]) => {
              opts.knowledgeUnitDeletes?.push(ids);
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`unexpected admin-client from(${table})`);
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      opts.rpcCalls?.push({ fn, params });
      if (opts.rpcError) {
        return { data: null, error: opts.rpcError };
      }
      return {
        data: opts.rpcResult ?? { handbook_snapshot_id: SNAPSHOT_ID },
        error: null,
      };
    },
  };
}

function makeUnitRow(
  overrides: Partial<{
    id: string;
    title: string;
    description: string;
    evidence_snippets: unknown[] | null;
    themes: string[] | null;
    aggregated_confidence: number;
    evidence_count: number;
    source_pattern_ids: string[] | null;
    curated_section: string;
    created_at: string;
    curator_user_id: string | null;
  }> = {},
) {
  return {
    id: UNIT_ID_1,
    title: "Title",
    description: "Description text.",
    evidence_snippets: [],
    themes: ["pricing", "prozesse"],
    aggregated_confidence: 0.9,
    evidence_count: 3,
    source_pattern_ids: [
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ],
    curated_section: "vertrieb/einwand-behandlung",
    created_at: "2026-06-05T10:00:00.000Z",
    curator_user_id: USER,
    ...overrides,
  };
}

describe("importToHandbook — Auth + Validation", () => {
  it("rejects unauthenticated user", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({ user: null }));
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Nicht authentifiziert/);
  });

  it("rejects employee role", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: TENANT, role: "employee" },
      }),
    );
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Tenant-Admins/);
  });

  it("rejects invalid UUID", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const result = await importToHandbook("not-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Ungueltige bulk_run_id/);
  });
});

describe("importToHandbook — Cross-Tenant + Status-Gate", () => {
  beforeEach(() => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
  });

  it("rejects Cross-Tenant Bulk-Run", async () => {
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: "different-tenant",
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "importing",
        },
      }),
    );
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Cross-Tenant/);
  });

  it("rejects status='pattern_extracted' (not yet in importing-state)", async () => {
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "pattern_extracted",
        },
      }),
    );
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/erwartet 'importing'/);
  });

  it("accepts status='failed' for re-try", async () => {
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "failed",
        },
        units: [],
      }),
    );
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(true);
  });

  it("rejects when capture_session_id is null", async () => {
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: null,
          source_file_name: "x.mbox",
          status: "importing",
        },
      }),
    );
    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/keine capture_session_id/);
  });
});

describe("importToHandbook — Idempotency + Re-Run", () => {
  beforeEach(() => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
  });

  it("0 pending units → status='completed' + no snapshot trigger + return stats=0", async () => {
    const bulkRunUpdates: Array<Record<string, unknown>> = [];
    const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];

    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "importing",
        },
        units: [],
        bulkRunUpdates,
        rpcCalls,
      }),
    );

    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.unitsImported).toBe(0);
      expect(result.knowledgeUnitsCreated).toBe(0);
      expect(result.handbookSnapshotId).toBe("");
    }
    expect(rpcCalls).toHaveLength(0);
    expect(bulkRunUpdates).toHaveLength(1);
    expect(bulkRunUpdates[0]?.status).toBe("completed");
  });
});

describe("importToHandbook — Happy Path", () => {
  beforeEach(() => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
  });

  it("3 units → 3 knowledge_units + RPC trigger + final-status='completed' + patterns_imported=3 (AC-D-1)", async () => {
    const bulkRunUpdates: Array<Record<string, unknown>> = [];
    const unitUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const knowledgeUnitInserts: Array<Record<string, unknown>> = [];
    const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];

    const units = [
      makeUnitRow({ id: UNIT_ID_1 }),
      makeUnitRow({ id: UNIT_ID_2, curated_section: "akquise/lead-qualifizierung" }),
      makeUnitRow({
        id: "66666666-6666-6666-6666-666666666666",
        curated_section: "team/onboarding",
      }),
    ];

    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "importing",
        },
        units,
        newCheckpointId: "ck-1",
        knowledgeUnitIds: ["ku-1", "ku-2", "ku-3"],
        bulkRunUpdates,
        unitUpdates,
        knowledgeUnitInserts,
        rpcCalls,
      }),
    );

    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.unitsImported).toBe(3);
      expect(result.knowledgeUnitsCreated).toBe(3);
      expect(result.handbookSnapshotId).toBe(SNAPSHOT_ID);
    }
    expect(knowledgeUnitInserts).toHaveLength(3);
    expect(knowledgeUnitInserts[0]?.source).toBe("email_bulk");
    expect(knowledgeUnitInserts[0]?.unit_type).toBe("observation");
    expect(knowledgeUnitInserts[0]?.status).toBe("accepted");
    // AC-D-2: kein Pseudonym-Pfad — body + metadata ohne P1/P2-Referenzen.
    const body = knowledgeUnitInserts[0]?.body as string;
    expect(body).toContain("**Belege**:");
    expect(body).not.toContain("**Pseudonyme**");
    const metadata = knowledgeUnitInserts[0]?.metadata as Record<string, unknown>;
    expect(metadata.synthesized_unit_id).toBe(UNIT_ID_1);
    expect(metadata.evidence_count).toBe(3);
    expect(metadata.participant_pseudonyms).toBeUndefined();
    // V9.8 AC-A-2 / DEC-228: themes der Quell-Unit fliessen in den INSERT.
    expect(knowledgeUnitInserts[0]?.themes).toEqual(["pricing", "prozesse"]);
    expect(unitUpdates).toHaveLength(3);
    expect(unitUpdates[0]?.patch.imported_knowledge_unit_id).toBe("ku-1");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe("rpc_trigger_handbook_snapshot");
    expect(rpcCalls[0]?.params).toEqual({
      p_capture_session_id: CAPTURE_SESSION_ID,
    });
    const finalUpdate = bulkRunUpdates[bulkRunUpdates.length - 1];
    expect(finalUpdate?.status).toBe("completed");
    expect(finalUpdate?.patterns_imported).toBe(3);
  });
});

describe("importToHandbook — Failure-Rollback", () => {
  beforeEach(() => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
  });

  it("knowledge_unit INSERT failure → rollback all + status='failed'", async () => {
    const bulkRunUpdates: Array<Record<string, unknown>> = [];
    const knowledgeUnitInserts: Array<Record<string, unknown>> = [];
    const knowledgeUnitDeletes: Array<string[]> = [];
    const unitBulkUpdates: Array<{ ids: string[]; patch: Record<string, unknown> }> = [];

    const units = [
      makeUnitRow({ id: UNIT_ID_1 }),
      makeUnitRow({ id: UNIT_ID_2 }),
    ];

    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "importing",
        },
        units,
        newCheckpointId: "ck-1",
        knowledgeUnitIds: ["ku-1"],
        knowledgeUnitInsertFailIndex: 1, // 2. unit fails
        bulkRunUpdates,
        knowledgeUnitInserts,
        knowledgeUnitDeletes,
        unitBulkUpdates,
      }),
    );

    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/knowledge_unit INSERT/);
    }
    // Rollback: 1 KU was inserted (1. unit), then 2. unit failed
    expect(knowledgeUnitDeletes).toHaveLength(1);
    expect(knowledgeUnitDeletes[0]).toEqual(["ku-1"]);
    expect(unitBulkUpdates).toHaveLength(1);
    expect(unitBulkUpdates[0]?.patch.imported_to_handbook_at).toBeNull();
    const failedUpdate = bulkRunUpdates[bulkRunUpdates.length - 1];
    expect(failedUpdate?.status).toBe("failed");
    expect(failedUpdate?.failure_reason).toBe("handbook_import_ku_insert_error");
  });

  it("Snapshot-Trigger failure → rollback all + status='failed' + failure_reason='handbook_snapshot_trigger_failed'", async () => {
    const bulkRunUpdates: Array<Record<string, unknown>> = [];
    const knowledgeUnitInserts: Array<Record<string, unknown>> = [];
    const knowledgeUnitDeletes: Array<string[]> = [];
    const unitBulkUpdates: Array<{ ids: string[]; patch: Record<string, unknown> }> = [];

    const units = [makeUnitRow({ id: UNIT_ID_1 })];

    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClientForImport({
        runRow: {
          id: RUN_ID,
          tenant_id: TENANT,
          capture_session_id: CAPTURE_SESSION_ID,
          source_file_name: "x.mbox",
          status: "importing",
        },
        units,
        newCheckpointId: "ck-1",
        knowledgeUnitIds: ["ku-1"],
        rpcError: { message: "rpc failed" },
        bulkRunUpdates,
        knowledgeUnitInserts,
        knowledgeUnitDeletes,
        unitBulkUpdates,
      }),
    );

    const result = await importToHandbook(RUN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Snapshot-Trigger/);
    }
    expect(knowledgeUnitDeletes).toHaveLength(1);
    expect(knowledgeUnitDeletes[0]).toEqual(["ku-1"]);
    expect(unitBulkUpdates).toHaveLength(1);
    const failedUpdate = bulkRunUpdates[bulkRunUpdates.length - 1];
    expect(failedUpdate?.status).toBe("failed");
    expect(failedUpdate?.failure_reason).toBe("handbook_snapshot_trigger_failed");
  });
});
