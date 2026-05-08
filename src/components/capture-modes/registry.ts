/**
 * Capture-Mode-Registry — SLC-038 finale Konsolidierung.
 *
 * Zentrale Map aller bekannten capture_modes. Liefert pro Mode:
 *   - basePath        Routing-Praefix vor /[sessionId]/...
 *   - workerJobType   Job-Type fuer Block-Submit-Verarbeitung
 *   - displayName     Lesbarer Name fuer Cockpit/Logs
 *   - productive      true = darf in tenant_admin-UI beworben werden
 *   - StubComponent   wenn ein Mode eine eigene UI-Komponente hat (statt der
 *                     Default-`QuestionnaireWorkspace`-Pipeline), wird sie
 *                     hier registriert. Aktuell nur fuer `walkthrough_stub`.
 *
 * Hook-Konvention (DEC-040):
 *   - Worker-Pipeline-Slot:  Job-Type-Naming `{mode}_processing`
 *   - UI-Slot:               `src/components/capture-modes/{mode}/...`
 *   - Routing/Permissions:   KEIN eigener Slot in V4 (siehe DEC-040)
 *
 * Hinzufuegen eines neuen Modes (siehe ARCHITECTURE.md Anhang A):
 *   1. CHECK-Constraint von capture_session.capture_mode erweitern (Migration).
 *   2. Worker-Handler unter src/workers/capture-modes/{mode}/handle.ts.
 *   3. UI-Komponente unter src/components/capture-modes/{mode}/{Mode}Mode.tsx.
 *   4. Eintrag in CAPTURE_MODE_REGISTRY (diese Datei).
 *   5. Ggf. Mode-spezifische Tabellen/Spalten (Migration).
 *   6. Tests.
 */

import type { ComponentType } from "react";
import { WalkthroughStubMode } from "./walkthrough-stub/WalkthroughStubMode";

export type CaptureMode =
  | "questionnaire"
  | "evidence"
  | "dialogue"
  | "employee_questionnaire"
  | "walkthrough"
  | "walkthrough_stub";

/**
 * Alias zu `CaptureMode` zur Erfuellung von Slice-AC-1 ("Type-Export
 * `CaptureModeKey` ist verfuegbar"). Semantisch identisch zu
 * `keyof typeof CAPTURE_MODE_REGISTRY`.
 */
export type CaptureModeKey = CaptureMode;

export interface CaptureModeMeta {
  /** URL-Praefix vor /[sessionId]/... fuer diesen Mode. */
  basePath: string;
  /**
   * Worker-Job-Type. Klassische Modes nutzen die zentrale
   * Verdichtungs-Pipeline (knowledge_unit_condensation, differenziert per
   * source-Tag im Worker). Spike-Modes haben eigenen Job-Type.
   */
  workerJobType: string;
  /** Lesbarer Name fuer Cockpit/Logs. */
  displayName: string;
  /**
   * true = darf in tenant_admin-UI als auswaehlbarer Mode beworben werden.
   * walkthrough_stub ist explizit `false` (nur per direkter URL erreichbar,
   * Spike-Status).
   */
  productive: boolean;
  /**
   * Mode-spezifische UI-Komponente, sofern der Mode NICHT die
   * Standard-`QuestionnaireWorkspace`-Pipeline durchlaufen soll.
   *
   * Fuer klassische Modes (questionnaire/evidence/voice/dialogue) und
   * employee_questionnaire ist `StubComponent = null` — die
   * Block-Detail-Page rendert die `QuestionnaireWorkspace` mit
   * Mode-spezifischen Sektionen (siehe `src/app/capture/[sessionId]/block/...`
   * bzw. `src/app/employee/capture/[sessionId]/block/...`).
   */
  StubComponent: ComponentType | null;
}

export const CAPTURE_MODE_REGISTRY: Record<CaptureMode, CaptureModeMeta> = {
  questionnaire: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
    displayName: "Fragebogen",
    productive: true,
    StubComponent: null,
  },
  evidence: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
    displayName: "Evidence-Upload",
    productive: true,
    StubComponent: null,
  },
  dialogue: {
    basePath: "/capture",
    workerJobType: "knowledge_unit_condensation",
    displayName: "Meeting-Dialog",
    productive: true,
    StubComponent: null,
  },
  employee_questionnaire: {
    basePath: "/employee/capture",
    workerJobType: "knowledge_unit_condensation",
    displayName: "Mitarbeiter-Fragebogen",
    productive: true,
    StubComponent: null,
  },
  walkthrough: {
    basePath: "/employee/walkthroughs",
    workerJobType: "walkthrough_transcribe",
    displayName: "Walkthrough",
    productive: true,
    StubComponent: null,
  },
  walkthrough_stub: {
    // V4 SLC-038 Spike — ersetzt durch produktiven 'walkthrough' in V5
    // Option 2. Code unter src/components/capture-modes/walkthrough-stub/
    // bleibt als Architektur-Beispiel fuer FEAT-025 Capture-Mode-Hooks
    // (SC-V4-6-Beweis). productive: false haelt den Eintrag aus jeder
    // Mode-Auswahl-UI heraus.
    basePath: "/capture",
    workerJobType: "walkthrough_stub_processing",
    displayName: "Walkthrough-Mode (Spike)",
    productive: false,
    StubComponent: WalkthroughStubMode,
  },
};

/**
 * Default-Mode bei `capture_mode IS NULL` aus V1-Bestandsdaten.
 */
export const DEFAULT_CAPTURE_MODE: CaptureMode = "questionnaire";

/**
 * Ermittelt die Routing-Metadaten fuer einen Mode-String. Faellt auf
 * `questionnaire` zurueck, wenn der Wert NULL/undefined oder unbekannt ist.
 *
 * Backwards-Compatibility: V1-Sessions ohne capture_mode-Spalte werden als
 * questionnaire behandelt.
 */
export function resolveCaptureMode(
  mode: string | null | undefined
): { key: CaptureMode; meta: CaptureModeMeta } {
  if (mode && mode in CAPTURE_MODE_REGISTRY) {
    const key = mode as CaptureMode;
    return { key, meta: CAPTURE_MODE_REGISTRY[key] };
  }
  return {
    key: DEFAULT_CAPTURE_MODE,
    meta: CAPTURE_MODE_REGISTRY[DEFAULT_CAPTURE_MODE],
  };
}

/**
 * Routing-Helper fuer Backward-Compat zu SLC-037 Code-Pfaden.
 */
export function resolveBasePath(captureMode: string | null | undefined): string {
  return resolveCaptureMode(captureMode).meta.basePath;
}

/**
 * Alle Mode-Keys (z.B. fuer Tests, Iteration).
 */
export const ALL_CAPTURE_MODES: readonly CaptureMode[] = Object.keys(
  CAPTURE_MODE_REGISTRY
) as CaptureMode[];
