// SLC-V9.7-B MT-4 — OKF Worker-Integrations-Helper (einziger Einstiegspunkt).
//
// Der Snapshot-Worker (handle-snapshot-job.ts) ruft NUR diese Funktion, damit
// der Worker-Kern OKF-agnostisch bleibt (AC-B-6). Sie kapselt emit -> assemble
// -> conformance und die WEICHE Degradation (DEC-225): jeder Fehler ODER ein
// Konformitaets-Verstoss -> `onError` + `null` (Worker laesst dann das `okf/`
// weg, narratives Handbuch bricht NIE).

import { assembleOkfBundle, type OkfBundleContext } from "./bundle";
import { checkOkfConformance } from "./conformance";
import {
  emitDiagnosisConcept,
  emitKnowledgeUnitConcept,
  emitSopConcept,
} from "./emit";
import type {
  DiagnosisInput,
  KnowledgeUnitInput,
  OkfConcept,
  OkfEmitContext,
  SopInput,
} from "./types";

/** Genau die kuratierten Eingaben, aus denen das Bundle entsteht. */
export interface OkfRowInputs {
  knowledgeUnits: KnowledgeUnitInput[];
  /** Bereits auf `status==='confirmed'` gefiltert (siehe isConfirmedDiagnosis). */
  diagnoses: DiagnosisInput[];
  sops: SopInput[];
}

/**
 * Diagnose-Selektor fuer den Worker: nur `confirmed`-Diagnosen werden als OKF
 * emittiert (DEC-222/225). Pure + unit-testbar, damit die Selektion nicht nur
 * implizit im Worker lebt.
 */
export function isConfirmedDiagnosis<T extends { status: string }>(
  row: T,
): boolean {
  return row.status === "confirmed";
}

/**
 * Baut das OKF-Bundle aus den kuratierten Eingaben — oder gibt `null` zurueck,
 * wenn irgendein Schritt scheitert bzw. das Ergebnis nicht konform ist (weiche
 * Degradation, DEC-225). Wirft NIE.
 */
export function buildOkfBundleOrNull(
  inputs: OkfRowInputs,
  ctx: OkfBundleContext & OkfEmitContext,
  onError: (err: unknown) => void,
): Record<string, string> | null {
  try {
    const emitCtx: OkfEmitContext = { tenantId: ctx.tenantId };
    const concepts: OkfConcept[] = [
      ...inputs.knowledgeUnits.map((row) =>
        emitKnowledgeUnitConcept(row, emitCtx),
      ),
      ...inputs.diagnoses.map((row) => emitDiagnosisConcept(row, emitCtx)),
      ...inputs.sops.map((row) => emitSopConcept(row, emitCtx)),
    ];

    const bundle = assembleOkfBundle(concepts, {
      tenantName: ctx.tenantName,
      generatedAt: ctx.generatedAt,
      snapshotId: ctx.snapshotId,
    });

    const conformance = checkOkfConformance(bundle);
    if (!conformance.ok) {
      const summary = conformance.violations
        .map((v) => `${v.file}:${v.rule}`)
        .join(", ");
      throw new Error(`OKF conformance failed: ${summary}`);
    }

    return bundle;
  } catch (err) {
    onError(err);
    return null;
  }
}
