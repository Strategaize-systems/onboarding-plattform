// V7.1 SLC-138 MT-4 — Diagnose-Telemetry Stub-Adapter.
//
// Pre-Wiring fuer SLC-139 FEAT-058 (diagnose_event-Tabelle). In V7.1 SLC-138
// loggen wir nur in die Browser-Console, damit die Helper-Modal-Komponente
// schon den Event-Aufruf-Pfad hat. SLC-139 wird `trackHelperTextOpen`
// durch einen Server-Action-Insert in `public.diagnose_event` ersetzen.
//
// Ref: docs/ARCHITECTURE.md V7.1 FEAT-058, slice SLC-138 MT-4, MIG-046.

export interface HelperTextOpenPayload {
  question_key: string;
  capture_session_id?: string;
}

/**
 * V7.1 SLC-138: Telemetry-Stub. Emits `helper_text_open` event.
 *
 * Production-Pfad wird in SLC-139 MIG-046 nachgezogen — bis dahin
 * Debug-Log fuer Live-Smoke + DevTools-Visibility.
 */
export function trackHelperTextOpen(payload: HelperTextOpenPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug("[diagnose.telemetry] helper_text_open", payload);
}
