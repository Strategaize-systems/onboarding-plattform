import { describe, it, expect } from "vitest";
import { workdaysSince } from "../workdays";

describe("workdaysSince", () => {
  it("returns 0 when start equals end", () => {
    const d = new Date("2026-04-13T10:00:00Z"); // Mon
    expect(workdaysSince(d, d)).toBe(0);
  });

  it("counts 5 workdays between Mon and following Mon", () => {
    const start = new Date("2026-04-13T00:00:00Z"); // Mon
    const end = new Date("2026-04-20T00:00:00Z"); // Mon (next week)
    expect(workdaysSince(start, end)).toBe(5);
  });

  it("returns 0 when start is Sat and end is Sun (no workdays in between)", () => {
    const sat = new Date("2026-04-18T00:00:00Z"); // Sat
    const sun = new Date("2026-04-19T00:00:00Z"); // Sun
    expect(workdaysSince(sat, sun)).toBe(0);
  });

  it("counts 1 workday from Fri to Mon (Mon is +1 workday)", () => {
    const fri = new Date("2026-04-17T00:00:00Z"); // Fri
    const mon = new Date("2026-04-20T00:00:00Z"); // Mon
    expect(workdaysSince(fri, mon)).toBe(1);
  });

  it("counts 3 workdays for the typical Stage-1-Trigger window", () => {
    // accepted_at = Mon, today = Thu → 3 Werktage
    const start = new Date("2026-04-13T08:00:00Z"); // Mon
    const end = new Date("2026-04-16T17:00:00Z"); // Thu
    expect(workdaysSince(start, end)).toBe(3);
  });

  it("counts 7 workdays for the typical Stage-2-Trigger window across a weekend", () => {
    // accepted_at = Mon W1, today = Wed W2 → 7 Werktage (Mo,Di,Mi,Do,Fr,Mo,Di,Mi -> 7 ohne den Start-Mo)
    const start = new Date("2026-04-13T00:00:00Z"); // Mon W1
    const end = new Date("2026-04-22T00:00:00Z"); // Wed W2
    expect(workdaysSince(start, end)).toBe(7);
  });

  it("uses now() as default end and is non-negative", () => {
    const result = workdaysSince(new Date());
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
