/**
 * SLC-071 MT-6 — Pure logic of the WalkthroughCapture client component.
 *
 * The React component itself touches `navigator.mediaDevices` and `MediaRecorder`,
 * which only exist in a browser. The vitest setup runs in `node` (no jsdom), so
 * we keep all transition rules, codec selection and the auto-stop deadline in a
 * pure module that can be exercised without any DOM.
 */

export const WALKTHROUGH_AUTO_STOP_MS = 30 * 60 * 1000; // DEC-076: 30min hard cap.
export const WALKTHROUGH_AUTO_STOP_WARN_MS = 25 * 60 * 1000;

export const WALKTHROUGH_PREFERRED_MIME = "video/webm;codecs=vp9,opus";
export const WALKTHROUGH_FALLBACK_MIME = "video/webm;codecs=vp8,opus";

export type WalkthroughCaptureState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "uploading"
  | "uploaded"
  | "failed";

export type WalkthroughCaptureEvent =
  | { type: "START" }
  | { type: "PERMISSIONS_GRANTED" }
  | { type: "STOP" }
  | { type: "RECORDER_STOPPED" }
  | { type: "UPLOAD_DONE" }
  | { type: "CONFIRMED" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export interface WalkthroughCaptureContext {
  state: WalkthroughCaptureState;
  errorMessage: string | null;
  /** Selected mime-type once recording starts; null while idle/requesting. */
  selectedMimeType: string | null;
  /** Set true when the fallback codec was chosen. UI shows a warning. */
  usedFallbackCodec: boolean;
  uploadProgress: number; // 0..100
}

export const INITIAL_CAPTURE_CONTEXT: WalkthroughCaptureContext = {
  state: "idle",
  errorMessage: null,
  selectedMimeType: null,
  usedFallbackCodec: false,
  uploadProgress: 0,
};

/**
 * Reducer for the capture state-machine. Only the transitions actually used by
 * the component are valid; everything else is a no-op so that stray events
 * (double-clicks, late callbacks) cannot wedge the UI into an absurd state.
 */
export function transition(
  ctx: WalkthroughCaptureContext,
  event: WalkthroughCaptureEvent
): WalkthroughCaptureContext {
  switch (event.type) {
    case "START":
      if (ctx.state !== "idle" && ctx.state !== "failed") return ctx;
      return {
        ...ctx,
        state: "requesting",
        errorMessage: null,
        uploadProgress: 0,
      };
    case "PERMISSIONS_GRANTED":
      if (ctx.state !== "requesting") return ctx;
      return { ...ctx, state: "recording", errorMessage: null };
    case "STOP":
      if (ctx.state !== "recording") return ctx;
      return { ...ctx, state: "stopping" };
    case "RECORDER_STOPPED":
      if (ctx.state !== "stopping") return ctx;
      return { ...ctx, state: "uploading", uploadProgress: 0 };
    case "UPLOAD_DONE":
      if (ctx.state !== "uploading") return ctx;
      return { ...ctx, state: "uploading", uploadProgress: 100 };
    case "CONFIRMED":
      if (ctx.state !== "uploading") return ctx;
      return { ...ctx, state: "uploaded" };
    case "ERROR":
      return { ...ctx, state: "failed", errorMessage: event.message };
    case "RESET":
      return { ...INITIAL_CAPTURE_CONTEXT };
  }
}

export interface CodecSelection {
  mimeType: string | null;
  usedFallback: boolean;
}

/**
 * Pick the best supported MediaRecorder mime-type. Returns `mimeType=null` when
 * neither vp9 nor vp8 is supported — the caller renders a user-friendly error
 * (Safari <16 etc.) instead of attempting to record.
 *
 * `isTypeSupported` is provided as a parameter so this is testable in node.
 */
export function pickMimeType(
  isTypeSupported: (mime: string) => boolean
): CodecSelection {
  if (isTypeSupported(WALKTHROUGH_PREFERRED_MIME)) {
    return { mimeType: WALKTHROUGH_PREFERRED_MIME, usedFallback: false };
  }
  if (isTypeSupported(WALKTHROUGH_FALLBACK_MIME)) {
    return { mimeType: WALKTHROUGH_FALLBACK_MIME, usedFallback: true };
  }
  return { mimeType: null, usedFallback: false };
}

/**
 * Schedules the 30-min hard stop. Returns the timer id and a clear() helper.
 * Kept as a thin wrapper so tests can assert that the auto-stop callback fires
 * after `WALKTHROUGH_AUTO_STOP_MS` using `vi.useFakeTimers()`.
 */
export function scheduleAutoStop(
  onAutoStop: () => void,
  timeoutMs: number = WALKTHROUGH_AUTO_STOP_MS,
  setTimer: (cb: () => void, ms: number) => unknown = setTimeout,
  clearTimer: (id: unknown) => void = (id) => clearTimeout(id as number)
) {
  const id = setTimer(onAutoStop, timeoutMs);
  return {
    clear: () => clearTimer(id),
  };
}

/** Format remaining recording time as `MM:SS`. */
export function formatRemaining(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
