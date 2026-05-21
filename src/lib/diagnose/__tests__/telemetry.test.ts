// V7.1 SLC-138 MT-4 — Telemetry-Stub Tests (FEAT-057, Pre-Wiring fuer FEAT-058).

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { trackHelperTextOpen } from "../telemetry";

describe("trackHelperTextOpen", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: typeof globalThis.window })
      .window;
    consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: typeof globalThis.window }).window;
    } else {
      (globalThis as { window?: typeof globalThis.window }).window =
        originalWindow;
    }
  });

  it("emits debug log with question_key payload when window is available", () => {
    (globalThis as { window?: unknown }).window = {} as unknown as Window;

    trackHelperTextOpen({ question_key: "ki_reife.q1" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[diagnose.telemetry] helper_text_open",
      { question_key: "ki_reife.q1" },
    );
  });

  it("forwards optional capture_session_id in payload", () => {
    (globalThis as { window?: unknown }).window = {} as unknown as Window;

    trackHelperTextOpen({
      question_key: "schriftliche_entscheidungen.q4",
      capture_session_id: "session-123",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[diagnose.telemetry] helper_text_open",
      {
        question_key: "schriftliche_entscheidungen.q4",
        capture_session_id: "session-123",
      },
    );
  });

  it("no-ops in SSR context (no window)", () => {
    delete (globalThis as { window?: typeof globalThis.window }).window;

    trackHelperTextOpen({ question_key: "ki_reife.q2" });

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
