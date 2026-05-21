// V7.1 SLC-138 + V7.2 SLC-139 — Diagnose-Telemetry Production-Adapter.
//
// SLC-138 hat den Stub etabliert (console.debug-Log). SLC-139 ersetzt durch
// fire-and-forget POST an `/api/diagnose-event`. Wird von HelperTextModal
// direkt aufgerufen (kein React-Context noetig, weil Modal je nach State
// gemountet wird und kein durchgaengiges Heartbeat-Tracking braucht).
//
// Multi-Event-Tracking (question_start/answer, heartbeat, visibilitychange,
// beforeunload) laeuft ueber `createDiagnoseTracker` + `DiagnoseTelemetryProvider`
// auf der Run-Page. helper_text_open koennte auch dort durchlaufen — V7.2 V1
// nutzt aber den Direkt-Pfad hier, weil das Modal beim Schliessen unmounted
// und der Hook waehrend der Open-Lebenszeit nicht zwingend stabil ist.
//
// Ref: docs/ARCHITECTURE.md V7.1 FEAT-057, V7.2 FEAT-058 MIG-046.

export interface HelperTextOpenPayload {
  question_key: string;
  capture_session_id?: string;
}

const ENDPOINT_PATH = "/api/diagnose-event";
const TEST_USER_LOCALSTORAGE_KEY = "strategaize:is_test_user";

function readIsTestFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(TEST_USER_LOCALSTORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function trackHelperTextOpen(payload: HelperTextOpenPayload): void {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return;
  }
  if (!payload.capture_session_id) {
    // Ohne Session-ID koennen wir nicht insertten (RLS-Pflicht). Fail-silent.
    return;
  }
  const body = {
    capture_session_id: payload.capture_session_id,
    event_type: "helper_text_open" as const,
    question_key: payload.question_key,
    payload: {},
    is_test: readIsTestFlag(),
  };
  void fetch(ENDPOINT_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // fire-and-forget — UX bleibt frei von Telemetry-Fehlern.
  });
}
