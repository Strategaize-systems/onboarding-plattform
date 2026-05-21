// SLC-139 MT-2 (FEAT-058) — Pure-Logic-Helpers fuer Diagnose-Tracker.
// Keine DOM/window/fetch-Abhaengigkeit hier — wird per Dependency-Injection
// im Tracker (diagnose.ts) konsumiert. Vitest-Coverage 100%.

import type {
  DiagnoseEventEnvelope,
  DiagnoseEventInput,
  DiagnoseSessionContext,
} from "./diagnose-event-types";

const TEST_USER_LOCALSTORAGE_KEY = "strategaize:is_test_user";

export function buildEventEnvelope(
  context: DiagnoseSessionContext,
  input: DiagnoseEventInput,
): DiagnoseEventEnvelope {
  return {
    capture_session_id: context.captureSessionId,
    event_type: input.type,
    question_key: input.questionKey ?? null,
    payload: input.payload ?? {},
    is_test: context.isTest,
  };
}

export function readIsTestFlagFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(TEST_USER_LOCALSTORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function mapVisibilityStateToEventType(
  visibilityState: DocumentVisibilityState,
): "session_paused" | "session_resumed" | null {
  if (visibilityState === "hidden") return "session_paused";
  if (visibilityState === "visible") return "session_resumed";
  return null;
}

export function serializeEnvelopeForBeacon(envelope: DiagnoseEventEnvelope): Blob {
  const json = JSON.stringify(envelope);
  return new Blob([json], { type: "application/json" });
}

export const HEARTBEAT_INTERVAL_MS = 5000;
export { TEST_USER_LOCALSTORAGE_KEY };
