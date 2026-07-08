// V10.4 SLC-190 MT-4 — Tests fuer scopeTenants (Berater-Tenant-Filter, DEC-269/270).
import { describe, it, expect } from "vitest";
import { scopeTenants } from "../tenant-scope";

/** Recording-Builder: merkt sich `.in`-Aufrufe, gibt sich selbst zurueck (chainable). */
function recordingBuilder() {
  const inCalls: { column: string; values: readonly string[] }[] = [];
  const builder = {
    in(column: string, values: readonly string[]) {
      inCalls.push({ column, values });
      return builder;
    },
  };
  return { builder, inCalls };
}

describe("scopeTenants", () => {
  it("undefined => KEIN Filter (Admin-Verhalten, 0 Regression)", () => {
    const { builder, inCalls } = recordingBuilder();
    const result = scopeTenants(builder, "tenant_id", undefined);
    expect(inCalls).toHaveLength(0);
    expect(result).toBe(builder);
  });

  it("[] => .in(column, []) (Berater ohne Zuweisung => 0 Zeilen, fail-closed)", () => {
    const { builder, inCalls } = recordingBuilder();
    scopeTenants(builder, "tenant_id", []);
    expect(inCalls).toEqual([{ column: "tenant_id", values: [] }]);
  });

  it("[ids] => .in(column, ids) mit exakter Spalte + Werten", () => {
    const { builder, inCalls } = recordingBuilder();
    scopeTenants(builder, "id", ["t1", "t2"]);
    expect(inCalls).toEqual([{ column: "id", values: ["t1", "t2"] }]);
  });
});
