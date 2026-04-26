/**
 * Capture-Mode-Registry — SLC-037 MT-2 (minimaler Eintrag fuer 'employee_questionnaire').
 *
 * Final-Konsolidierung in SLC-038. Hier nur ein Marker-Objekt, das die
 * supporteten capture_modes auflistet und das Routing-Praefix pro Mode mappt.
 *
 * Verwendung:
 *   - /employee/capture/[sessionId]/...  — capture_mode='employee_questionnaire'
 *   - /capture/[sessionId]/...           — capture_mode IN ('questionnaire','dialogue','evidence', NULL)
 *
 * SLC-038 wird hier UI-Mode-Komponenten registrieren (wie in ARCHITECTURE.md
 * Zeile 2355 skizziert). Aktuell brauchen wir nur die routePrefix-Map fuer
 * die Pfad-Aufloesung.
 */

export type CaptureMode =
  | "questionnaire"
  | "evidence"
  | "dialogue"
  | "employee_questionnaire"
  | "walkthrough_stub";

export interface CaptureModeRouting {
  /** URL-Praefix vor /[sessionId]/... fuer diesen Mode. */
  basePath: string;
  /**
   * Worker-Job-Type fuer Block-Submit. Aktuell alle Modes ueber
   * 'knowledge_unit_condensation', differenziert durch source-Tag im Worker
   * (siehe handleCondensationJob). SLC-038 spaltet ggf. eigene Job-Types ab.
   */
  workerJobType: "knowledge_unit_condensation";
}

export const CAPTURE_MODE_ROUTING: Record<CaptureMode, CaptureModeRouting> = {
  questionnaire: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
  },
  evidence: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
  },
  dialogue: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
  },
  employee_questionnaire: {
    basePath: "/employee/capture",
    workerJobType: "knowledge_unit_condensation",
  },
  walkthrough_stub: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
  },
};

/**
 * Resolved den Base-Pfad fuer einen capture_mode (mit NULL-Fallback auf GF-Flow).
 */
export function resolveBasePath(captureMode: string | null | undefined): string {
  if (captureMode && captureMode in CAPTURE_MODE_ROUTING) {
    return CAPTURE_MODE_ROUTING[captureMode as CaptureMode].basePath;
  }
  return "/capture";
}
