import { describe, it, expect, vi, afterEach } from "vitest";
import {
  INITIAL_CAPTURE_CONTEXT,
  WALKTHROUGH_AUTO_STOP_MS,
  WALKTHROUGH_FALLBACK_MIME,
  WALKTHROUGH_PREFERRED_MIME,
  pickMimeType,
  scheduleAutoStop,
  transition,
} from "../walkthrough-capture-logic";

// SLC-071 MT-6 — pure-logic tests for WalkthroughCapture. The component itself
// requires browser APIs (MediaRecorder, getDisplayMedia, getUserMedia); the
// state machine, codec-selection and 30min hard-stop scheduling live in a pure
// module so we can verify them in vitest's node environment without jsdom.

describe("WalkthroughCapture state machine", () => {
  it("advances idle -> requesting -> recording on START + PERMISSIONS_GRANTED", () => {
    const requesting = transition(INITIAL_CAPTURE_CONTEXT, { type: "START" });
    expect(requesting.state).toBe("requesting");
    expect(requesting.errorMessage).toBeNull();

    const recording = transition(requesting, { type: "PERMISSIONS_GRANTED" });
    expect(recording.state).toBe("recording");

    // Ignored event in wrong state must not corrupt context.
    const ignored = transition(recording, { type: "PERMISSIONS_GRANTED" });
    expect(ignored).toBe(recording);
  });

  it("falls into 'failed' with a user-visible message when codecs are unsupported", () => {
    // pickMimeType is the indirection the component uses to detect the no-codec
    // case (Safari <16 etc.). Returning null mimeType means the component will
    // dispatch ERROR and never enter 'recording'.
    const isTypeSupported = vi.fn().mockReturnValue(false);
    const codec = pickMimeType(isTypeSupported);

    expect(codec.mimeType).toBeNull();
    expect(codec.usedFallback).toBe(false);
    expect(isTypeSupported).toHaveBeenCalledWith(WALKTHROUGH_PREFERRED_MIME);
    expect(isTypeSupported).toHaveBeenCalledWith(WALKTHROUGH_FALLBACK_MIME);

    const requesting = transition(INITIAL_CAPTURE_CONTEXT, { type: "START" });
    const failed = transition(requesting, {
      type: "ERROR",
      message: "Browser unterstuetzt kein WebM-Recording.",
    });
    expect(failed.state).toBe("failed");
    expect(failed.errorMessage).toMatch(/WebM/i);

    // Fallback path: when only vp8 is supported, we still record but flag it.
    const fallbackProbe = vi
      .fn<(mime: string) => boolean>()
      .mockImplementation((m) => m === WALKTHROUGH_FALLBACK_MIME);
    const fb = pickMimeType(fallbackProbe);
    expect(fb.mimeType).toBe(WALKTHROUGH_FALLBACK_MIME);
    expect(fb.usedFallback).toBe(true);
  });
});

describe("WalkthroughCapture auto-stop scheduling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes the auto-stop callback after exactly the 30min hard cap", () => {
    vi.useFakeTimers();
    const onAutoStop = vi.fn();

    const handle = scheduleAutoStop(onAutoStop);

    // 1ms before the cap: no fire yet.
    vi.advanceTimersByTime(WALKTHROUGH_AUTO_STOP_MS - 1);
    expect(onAutoStop).not.toHaveBeenCalled();

    // Reaching the cap: fires once.
    vi.advanceTimersByTime(1);
    expect(onAutoStop).toHaveBeenCalledTimes(1);

    handle.clear();
  });
});
