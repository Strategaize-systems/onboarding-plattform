// V10.2 SLC-183 MT-2 — KI-Kurzfazit fuer Workspace-Berichte (Haiku 4.5, EU)
//
// Slice: SLC-183 — Berater-KI-Workspace "Mein Tag": 5 Standard-Berichte cross-Mandant
// DECs: DEC-259 (Fazit fail-open, error_log-Audit only, KEIN ai_cost_ledger),
//       ISSUE-111 (Haiku modelId MUSS explizit gesetzt werden — kein ENV-/Default-Drift)
//
// Pattern-Reuse aus:
//   - src/lib/ai/bedrock-haiku (invokeHaiku + Test-Injection-Hooks, Region eu-central-1)
//   - src/lib/logger (captureException → error_log)
//
// Vertrag: summarizeReport wirft NIE. Jeder LLM-/Parse-/Schema-Fehler → { fazit: null }
// (fail-open) + captureException-Audit ins error_log. Kein ai_cost_ledger-Write (DEC-259).

import { z } from "zod";

import { invokeHaiku } from "@/lib/ai/bedrock-haiku";
import { captureException } from "@/lib/logger";

// ─── Explizite Modell-ID (ISSUE-111) ───
// Haiku 4.5 via Bedrock eu-central-1. NICHT dem ENV-/Adapter-Default vertrauen —
// explizit uebergeben, damit ein ENV-Drift die Fazit-Generierung nicht still
// auf ein anderes Modell umlenkt.
const HAIKU_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0" as const;

// ─── Token-/Payload-Bounds ───
const MAX_OUTPUT_TOKENS = 400;
const MAX_DATA_CHARS = 6000;

// ─── Erwartetes Haiku-Output-Schema ───
export const FazitSchema = z.object({ fazit: z.string().min(1) });

export interface SummarizeReportInput {
  /** Report-Key, z.B. "mandanten_uebersicht" | "review_queue" | ... */
  reportKey: string;
  /** Menschenlesbares Label, z.B. "Mandanten-Übersicht" */
  reportTitle: string;
  /** Das geladene Report-Objekt (JSON-serialisierbar) */
  data: unknown;
}

export interface SummarizeReportResult {
  fazit: string | null;
}

const SYSTEM_PROMPT =
  "Du bist ein Analyse-Assistent für einen Unternehmensberater. " +
  "Fasse den folgenden Cross-Mandanten-Bericht in 2-3 prägnanten deutschen Sätzen zusammen " +
  "(Kernaussage plus die auffälligste Beobachtung). Bleibe sachlich und knapp. " +
  'Antworte AUSSCHLIESSLICH als JSON im Format { "fazit": string } ohne weitere Erklärung.';

/**
 * Serialisiert die Report-Daten und begrenzt die Laenge, um die Token-Kosten
 * zu bounden. Sehr grosse Payloads werden bei ~MAX_DATA_CHARS abgeschnitten.
 */
function serializeData(data: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(data);
  } catch {
    // Nicht-serialisierbar (z.B. zirkulaer) → String-Fallback statt Throw.
    json = String(data);
  }
  if (json.length > MAX_DATA_CHARS) {
    return `${json.slice(0, MAX_DATA_CHARS)}… [gekürzt]`;
  }
  return json;
}

/**
 * Erzeugt ein 2-3-Satz-KI-Kurzfazit fuer einen der Workspace-Berichte.
 *
 * Fail-open: JEDER Fehler (LLM-Fehler, leere Antwort, ungueltiges JSON, Schema-Drift,
 * AWS-Fehler) fuehrt zu { fazit: null } — nie zu einem Throw. Der Fehler wird via
 * captureException ins error_log auditiert. KEIN ai_cost_ledger-Write (DEC-259).
 */
export async function summarizeReport(
  input: SummarizeReportInput,
): Promise<SummarizeReportResult> {
  try {
    const userPrompt = `Bericht: ${input.reportTitle}\n\nDaten (JSON):\n${serializeData(
      input.data,
    )}`;

    const result = await invokeHaiku(
      { system: SYSTEM_PROMPT, user: userPrompt },
      FazitSchema,
      {
        modelId: HAIKU_MODEL_ID,
        temperature: 0,
        maxTokens: MAX_OUTPUT_TOKENS,
      },
    );

    return { fazit: result.data.fazit };
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/fazit/summarizeReport",
      metadata: { reportKey: input.reportKey },
    });
    return { fazit: null };
  }
}
