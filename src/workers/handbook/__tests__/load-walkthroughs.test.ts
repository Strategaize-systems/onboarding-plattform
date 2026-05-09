// SLC-091 MT-2 — Tests fuer loadApprovedWalkthroughs.
//
// Deterministisch via Mock-SupabaseClient. Live-DB-RLS-Tests laufen separat in
// SLC-092 MT-4 (walkthrough-embed-rls.test.ts gegen Coolify-DB).

import { describe, expect, it, vi } from "vitest";
import { loadApprovedWalkthroughs } from "../load-walkthroughs";

interface QueryBuilderInput {
  // Sequence: from(table) -> chain(select|eq|in|is|order) -> result
  select?: string;
  eqs?: Array<[string, unknown]>;
  ins?: Array<[string, unknown[]]>;
  iss?: Array<[string, null]>;
  orders?: Array<[string, { ascending: boolean }]>;
}

function makeMockClient(tablesByCall: Record<string, { data: unknown[]; error: null | { message: string } }[]>): unknown {
  const callCount: Record<string, number> = {};
  return {
    from(table: string) {
      callCount[table] = (callCount[table] ?? 0) + 1;
      const responses = tablesByCall[table] ?? [];
      const idx = callCount[table] - 1;
      const response = responses[idx] ?? { data: [], error: null };

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.in = chain;
      builder.is = chain;
      builder.order = chain;
      // terminal: thenable
      builder.then = (resolve: (r: unknown) => void) => resolve(response);
      return builder;
    },
  };
}

const TENANT_A = "00000000-0000-0000-0000-00000000000a";
const SESSION_1 = "11111111-1111-1111-1111-111111111111";
const SESSION_2 = "22222222-2222-2222-2222-222222222222";
const STEP_1A = "aaaaaaaa-1111-1111-1111-111111111111";
const STEP_1B = "bbbbbbbb-1111-1111-1111-111111111111";
const STEP_2A = "aaaaaaaa-2222-2222-2222-222222222222";
const RECORDER_1 = "ffffffff-1111-1111-1111-111111111111";
const RECORDER_2 = "ffffffff-2222-2222-2222-222222222222";

describe("loadApprovedWalkthroughs", () => {
  it("liefert leere Liste wenn keine approved Sessions existieren", async () => {
    const client = makeMockClient({
      walkthrough_session: [{ data: [], error: null }],
    });
    const result = await loadApprovedWalkthroughs(client as never, TENANT_A);
    expect(result).toEqual([]);
  });

  it("aggregiert Sessions + Steps + Mappings + Recorder-Email korrekt", async () => {
    const client = makeMockClient({
      walkthrough_session: [
        {
          data: [
            {
              id: SESSION_1,
              tenant_id: TENANT_A,
              recorded_by_user_id: RECORDER_1,
              storage_path: `${TENANT_A}/${SESSION_1}/recording.webm`,
              duration_sec: 1234,
              reviewed_at: "2026-05-08T10:00:00Z",
              created_at: "2026-05-08T09:00:00Z",
            },
            {
              id: SESSION_2,
              tenant_id: TENANT_A,
              recorded_by_user_id: RECORDER_2,
              storage_path: `${TENANT_A}/${SESSION_2}/recording.webm`,
              duration_sec: 600,
              reviewed_at: null,
              created_at: "2026-05-08T11:00:00Z",
            },
          ],
          error: null,
        },
      ],
      walkthrough_step: [
        {
          data: [
            {
              id: STEP_1A,
              walkthrough_session_id: SESSION_1,
              step_number: 1,
              action: "Login pruefen",
              responsible: "Vermietungs-Manager",
              timeframe: "1 min",
              success_criterion: "User ist eingeloggt",
              dependencies: null,
              transcript_snippet: "Ich klicke auf Login...",
            },
            {
              id: STEP_1B,
              walkthrough_session_id: SESSION_1,
              step_number: 2,
              action: "Mieter anlegen",
              responsible: null,
              timeframe: null,
              success_criterion: null,
              dependencies: "Schritt 1",
              transcript_snippet: null,
            },
            {
              id: STEP_2A,
              walkthrough_session_id: SESSION_2,
              step_number: 1,
              action: "Vertrag generieren",
              responsible: "Buchhaltung",
              timeframe: null,
              success_criterion: null,
              dependencies: null,
              transcript_snippet: null,
            },
          ],
          error: null,
        },
      ],
      profiles: [
        {
          data: [
            { id: RECORDER_1, email: "max.mustermann@firma.de" },
            { id: RECORDER_2, email: null },
          ],
          error: null,
        },
      ],
      walkthrough_review_mapping: [
        {
          data: [
            {
              walkthrough_step_id: STEP_1A,
              subtopic_id: "Block A / A1 Grundverstaendnis",
              confidence_band: "green",
              reviewer_corrected: false,
            },
            {
              walkthrough_step_id: STEP_1B,
              subtopic_id: null,
              confidence_band: "red",
              reviewer_corrected: true,
            },
            // Step 2A hat KEIN Mapping (mapping fehlt → mapped als unmapped behandelt)
          ],
          error: null,
        },
      ],
    });

    const result = await loadApprovedWalkthroughs(client as never, TENANT_A);

    expect(result).toHaveLength(2);

    // Session 1
    expect(result[0]).toMatchObject({
      id: SESSION_1,
      tenant_id: TENANT_A,
      recorder_display_name: "max.mustermann",
      duration_sec: 1234,
      reviewed_at: "2026-05-08T10:00:00Z",
    });
    expect(result[0].steps).toHaveLength(2);
    expect(result[0].steps[0].action).toBe("Login pruefen");
    expect(result[0].mappings).toHaveLength(2);
    expect(result[0].mappings[0].subtopic_id).toBe("Block A / A1 Grundverstaendnis");
    expect(result[0].mappings[1].subtopic_id).toBeNull();

    // Session 2 — Recorder ohne email -> Fallback
    expect(result[1]).toMatchObject({
      id: SESSION_2,
      recorder_display_name: "Unbekannter Mitarbeiter",
      duration_sec: 600,
      reviewed_at: null,
    });
    expect(result[1].steps).toHaveLength(1);
    expect(result[1].mappings).toHaveLength(0); // kein Mapping fuer STEP_2A
  });

  it("skipped Sessions ohne Steps (defensive)", async () => {
    const client = makeMockClient({
      walkthrough_session: [
        {
          data: [
            {
              id: SESSION_1,
              tenant_id: TENANT_A,
              recorded_by_user_id: RECORDER_1,
              storage_path: null,
              duration_sec: null,
              reviewed_at: null,
              created_at: "2026-05-08T09:00:00Z",
            },
          ],
          error: null,
        },
      ],
      walkthrough_step: [{ data: [], error: null }],
      profiles: [{ data: [{ id: RECORDER_1, email: "x@y.de" }], error: null }],
    });

    const result = await loadApprovedWalkthroughs(client as never, TENANT_A);
    expect(result).toEqual([]);
  });

  it("wirft mit klarer Message bei DB-Error", async () => {
    const client = makeMockClient({
      walkthrough_session: [
        { data: [], error: { message: "connection lost" } },
      ],
    });

    await expect(loadApprovedWalkthroughs(client as never, TENANT_A)).rejects.toThrow(
      /connection lost/,
    );
  });

  it("haelt Steps mit deleted_at IS NULL Filter (Loader-Convention)", async () => {
    // Verifiziert dass der Loader den is('deleted_at', null)-Filter setzt.
    // Wir zaehlen die from()-Aufrufe und pruefen via spy ob der Builder is() aufruft.
    const isCalls: Array<[string, null]> = [];
    let stepCallSeen = false;

    const client = {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.in = (...args: unknown[]) => {
          if (table === "walkthrough_step" && args[0] === "walkthrough_session_id") {
            stepCallSeen = true;
          }
          return builder;
        };
        builder.is = (col: string, val: null) => {
          isCalls.push([col, val]);
          return builder;
        };
        builder.order = chain;
        builder.then = (resolve: (r: unknown) => void) => {
          if (table === "walkthrough_session") {
            resolve({
              data: [
                {
                  id: SESSION_1,
                  tenant_id: TENANT_A,
                  recorded_by_user_id: RECORDER_1,
                  storage_path: null,
                  duration_sec: null,
                  reviewed_at: null,
                  created_at: "2026-05-08T09:00:00Z",
                },
              ],
              error: null,
            });
          } else {
            resolve({ data: [], error: null });
          }
        };
        return builder;
      },
    };

    await loadApprovedWalkthroughs(client as never, TENANT_A);

    expect(stepCallSeen).toBe(true);
    expect(isCalls).toContainEqual(["deleted_at", null]);
  });
});

// Silence unused vi warning in case mock setup changes
void vi;
void ({} as QueryBuilderInput);
