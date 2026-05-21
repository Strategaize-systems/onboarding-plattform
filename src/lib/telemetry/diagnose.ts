// SLC-139 MT-2 (FEAT-058) — Diagnose-Funnel-Tracker (Client-Side).
//
// Verantwortlich fuer fire-and-forget POST von Diagnose-Events an
// `/api/diagnose-event` + Heartbeat-Interval + visibilitychange-Listener +
// beforeunload-Flush via sendBeacon. DOM/Network-Abhaengigkeiten sind ueber
// Dependency-Injection abstrahiert, damit Tests gegen Pure-Logic-Helpers
// (diagnose-logic.ts) ohne jsdom laufen koennen.
//
// Verwendung im UI (siehe DiagnoseTelemetryProvider.tsx + MT-4 Wiring):
//   const tracker = createDiagnoseTracker({ captureSessionId, isTest });
//   tracker.trackEvent({ type: "question_start", questionKey: "q1" });
//   ...
//   tracker.dispose();

import {
  HEARTBEAT_INTERVAL_MS,
  buildEventEnvelope,
  mapVisibilityStateToEventType,
  readIsTestFlagFromStorage,
  serializeEnvelopeForBeacon,
} from "./diagnose-logic";
import type {
  DiagnoseEventInput,
  DiagnoseSessionContext,
} from "./diagnose-event-types";

const ENDPOINT_PATH = "/api/diagnose-event";

export interface DiagnoseTrackerDeps {
  fetch?: typeof globalThis.fetch;
  sendBeacon?: (url: string, data: Blob) => boolean;
  document?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  window?: Pick<Window, "addEventListener" | "removeEventListener">;
  setInterval?: (handler: () => void, timeout: number) => number;
  clearInterval?: (handle: number) => void;
  localStorage?: Pick<Storage, "getItem">;
  endpointPath?: string;
}

export interface DiagnoseTracker {
  trackEvent: (input: DiagnoseEventInput) => void;
  dispose: () => void;
}

export interface CreateTrackerOptions {
  captureSessionId: string;
  isTest?: boolean;
  currentQuestionKeyRef?: { current: string | null };
}

export function createDiagnoseTracker(
  options: CreateTrackerOptions,
  deps: DiagnoseTrackerDeps = {},
): DiagnoseTracker {
  const win = deps.window ?? (typeof window !== "undefined" ? window : undefined);
  const doc = deps.document ?? (typeof document !== "undefined" ? document : undefined);
  const storage = deps.localStorage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const fetchImpl = deps.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const beaconImpl =
    deps.sendBeacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon.bind(navigator)
      : undefined);
  const setIntervalImpl =
    deps.setInterval ?? (typeof setInterval !== "undefined" ? setInterval : undefined);
  const clearIntervalImpl =
    deps.clearInterval ?? (typeof clearInterval !== "undefined" ? clearInterval : undefined);
  const endpoint = deps.endpointPath ?? ENDPOINT_PATH;

  const context: DiagnoseSessionContext = {
    captureSessionId: options.captureSessionId,
    isTest: options.isTest ?? readIsTestFlagFromStorage(storage ?? null),
  };

  const questionKeyRef = options.currentQuestionKeyRef ?? { current: null };

  function postEvent(input: DiagnoseEventInput): void {
    if (!fetchImpl) return;
    const envelope = buildEventEnvelope(context, input);
    void fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      keepalive: true,
    }).catch(() => {
      // fire-and-forget — keine UX-Block bei Telemetry-Fehlern.
    });
  }

  function trackEvent(input: DiagnoseEventInput): void {
    if (input.questionKey) {
      questionKeyRef.current = input.questionKey;
    }
    postEvent(input);
  }

  const handleVisibilityChange = (): void => {
    if (!doc) return;
    const mapped = mapVisibilityStateToEventType(doc.visibilityState);
    if (!mapped) return;
    postEvent({
      type: mapped,
      questionKey: questionKeyRef.current,
      payload: { reason: "visibilitychange" },
    });
  };

  const handleBeforeUnload = (): void => {
    if (!beaconImpl) return;
    const envelope = buildEventEnvelope(context, {
      type: "session_paused",
      questionKey: questionKeyRef.current,
      payload: { reason: "beforeunload" },
    });
    beaconImpl(endpoint, serializeEnvelopeForBeacon(envelope));
  };

  const handleHeartbeat = (): void => {
    postEvent({
      type: "session_heartbeat",
      questionKey: questionKeyRef.current,
      payload: { reason: "interval" },
    });
  };

  doc?.addEventListener("visibilitychange", handleVisibilityChange);
  win?.addEventListener("beforeunload", handleBeforeUnload);
  const intervalHandle = setIntervalImpl ? setIntervalImpl(handleHeartbeat, HEARTBEAT_INTERVAL_MS) : undefined;

  function dispose(): void {
    doc?.removeEventListener("visibilitychange", handleVisibilityChange);
    win?.removeEventListener("beforeunload", handleBeforeUnload);
    if (intervalHandle !== undefined && clearIntervalImpl) {
      clearIntervalImpl(intervalHandle);
    }
  }

  return { trackEvent, dispose };
}
