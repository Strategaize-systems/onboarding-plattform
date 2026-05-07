// Vitest tests for advanceWalkthroughPipeline (SLC-076 MT-5 / shared by SLC-077/078).

import { describe, it, expect, beforeEach } from "vitest";
import { advanceWalkthroughPipeline } from "../pipeline-trigger";

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
}

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}

interface MockClient {
  sessionRow: { id: string; tenant_id: string; status: string } | null;
  sessionLoadError: Error | null;
  updates: UpdateCall[];
  inserts: InsertCall[];
  jobInsertId: string;
  jobInsertError: Error | null;
  updateError: Error | null;
}

function makeAdminClient(state: MockClient) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async single() {
                  if (state.sessionLoadError) {
                    return { data: null, error: state.sessionLoadError };
                  }
                  return { data: state.sessionRow, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, _val: string) {
              state.updates.push({ table, patch });
              return { error: state.updateError };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push({ table, row });
          return {
            select(_cols: string) {
              return {
                async single() {
                  if (state.jobInsertError) {
                    return { data: null, error: state.jobInsertError };
                  }
                  return { data: { id: state.jobInsertId }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";

let state: MockClient;

beforeEach(() => {
  state = {
    sessionRow: { id: SESSION_ID, tenant_id: TENANT_ID, status: "redacting" },
    sessionLoadError: null,
    updates: [],
    inserts: [],
    jobInsertId: "job-id",
    jobInsertError: null,
    updateError: null,
  };
});

describe("advanceWalkthroughPipeline", () => {
  it("transcribing → redacting + enqueues walkthrough_redact_pii", async () => {
    state.sessionRow!.status = "transcribing";

     
    const result = await advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID);

    expect(result).toEqual({
      fromStatus: "transcribing",
      toStatus: "redacting",
      enqueuedJobType: "walkthrough_redact_pii",
      enqueuedJobId: "job-id",
    });
    expect(state.updates[0].patch.status).toBe("redacting");
    expect(state.inserts[0].row.job_type).toBe("walkthrough_redact_pii");
    expect((state.inserts[0].row.payload as Record<string, unknown>).walkthroughSessionId).toBe(
      SESSION_ID,
    );
  });

  it("redacting → extracting + enqueues walkthrough_extract_steps", async () => {
    state.sessionRow!.status = "redacting";

     
    const result = await advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID);

    expect(result.toStatus).toBe("extracting");
    expect(result.enqueuedJobType).toBe("walkthrough_extract_steps");
    expect(state.inserts[0].row.tenant_id).toBe(TENANT_ID);
  });

  it("extracting → mapping + enqueues walkthrough_map_subtopics", async () => {
    state.sessionRow!.status = "extracting";

     
    const result = await advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID);

    expect(result.toStatus).toBe("mapping");
    expect(result.enqueuedJobType).toBe("walkthrough_map_subtopics");
  });

  it("mapping → pending_review with NO ai_jobs enqueue (terminal pipeline state)", async () => {
    state.sessionRow!.status = "mapping";

     
    const result = await advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID);

    expect(result.toStatus).toBe("pending_review");
    expect(result.enqueuedJobType).toBeNull();
    expect(result.enqueuedJobId).toBeNull();
    expect(state.inserts).toHaveLength(0);
  });

  it("throws on unexpected current status (not a pipeline stage)", async () => {
    state.sessionRow!.status = "approved";

    await expect(
       
      advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID),
    ).rejects.toThrow(/not a pipeline stage/);

    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("throws when session does not exist", async () => {
    state.sessionRow = null;
    state.sessionLoadError = new Error("no row");

    await expect(
       
      advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID),
    ).rejects.toThrow(/not found/);
  });

  it("throws when ai_jobs INSERT fails (does not silently swallow)", async () => {
    state.sessionRow!.status = "redacting";
    state.jobInsertError = new Error("permission denied");

    await expect(
       
      advanceWalkthroughPipeline(makeAdminClient(state) as any, SESSION_ID),
    ).rejects.toThrow(/INSERT walkthrough_extract_steps/);
  });
});
