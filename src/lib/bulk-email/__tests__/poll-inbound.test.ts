// V9.1 SLC-V9.1-D MT-6 — poll-inbound loop-logic tests (hermetisch, kein DB).
// Verifiziert AC-V9.1-D-6 Polling-Verhalten (Intervall + max-Attempts + Timeout)
// ueber injizierte finder/sleepFn — die echte adminInboundFinder-DB-Query wird im
// Live-Smoke (deferred, IONOS-gated) end-to-end verifiziert.

import { describe, it, expect, vi } from "vitest";
import {
  pollForInboundEmail,
  type InboundEmailRow,
  type InboundFinder,
} from "../poll-inbound";

const ROW: InboundEmailRow = {
  id: "msg-1",
  bulk_run_id: "run-1",
  message_id: "<test@bulk>",
  subject: "Test",
  from_address: "founder@strategaize.de",
  received_at: "2026-06-11T10:00:00.000Z",
};

describe("pollForInboundEmail", () => {
  it("returns the row on the first attempt without sleeping", async () => {
    const finder = vi.fn<InboundFinder>().mockResolvedValue(ROW);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollForInboundEmail("ep-1", "2026-06-11T09:59:00Z", {
      finder,
      sleepFn,
    });

    expect(result).toEqual(ROW);
    expect(finder).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("polls with the configured interval until a row appears", async () => {
    const finder = vi
      .fn<InboundFinder>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ROW);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollForInboundEmail("ep-1", "2026-06-11T09:59:00Z", {
      finder,
      sleepFn,
      intervalMs: 3000,
      maxAttempts: 20,
    });

    expect(result).toEqual(ROW);
    expect(finder).toHaveBeenCalledTimes(3);
    // sleep runs between attempts: before attempt 2 and attempt 3 -> 2 sleeps.
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(3000);
  });

  it("returns null after exhausting maxAttempts (timeout)", async () => {
    const finder = vi.fn<InboundFinder>().mockResolvedValue(null);
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollForInboundEmail("ep-1", "2026-06-11T09:59:00Z", {
      finder,
      sleepFn,
      maxAttempts: 5,
    });

    expect(result).toBeNull();
    expect(finder).toHaveBeenCalledTimes(5);
    expect(sleepFn).toHaveBeenCalledTimes(4); // one fewer sleep than attempts
  });

  it("passes endpointId and sinceIso through to the finder", async () => {
    const finder = vi.fn<InboundFinder>().mockResolvedValue(ROW);
    await pollForInboundEmail("ep-42", "2026-06-11T08:00:00Z", {
      finder,
      sleepFn: vi.fn().mockResolvedValue(undefined),
    });
    expect(finder).toHaveBeenCalledWith("ep-42", "2026-06-11T08:00:00Z");
  });
});
