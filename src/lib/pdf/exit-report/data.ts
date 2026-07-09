// V10.5 SLC-191 MT-1 — Exit-Report Daten-Loader (PURE Transform + duenner Fetch).
//
// Pattern gespiegelt aus src/lib/pdf/fahrplan-report/data.ts (DEC-272, Reuse):
//   - `buildExitReportInput` ist PURE (Fixture-testbar), defensiv gegen jsonb-Rohdaten.
//   - `loadExitReportInput` ist der duenne Supabase-Wrapper drumherum.
//
// Abweichung von der Slice-Spec (MT-0-Grounding, RPT-625): diagnosis_schema wird NICHT
// ueber getTemplateById geladen — TemplateRowSchema (template-queries.ts) enthaelt kein
// diagnosis_schema, Zod strippt es. Stattdessen ein direkter Raw-Select
// `template.select("blocks, diagnosis_schema")`; beide Spalten werden defensiv geparst.

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadFahrplanInput } from "../fahrplan-report/data";
import type { FahrplanInput } from "../fahrplan-report/types";
import type { DiagnosisSubtopic, ExitReportInput, OwnerDepQuestion } from "./types";

// ── defensive Zugriffs-Helfer (jsonb kommt als unknown; alles nullable) ──

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Waehlt aus einem i18n-Titel (Record<lang,string>) den de-Wert, sonst den ersten echten String — sonst null. */
function pickTitle(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim().length > 0 ? raw : null;
  const rec = asRecord(raw);
  if (!rec) return null;
  const de = rec.de;
  if (typeof de === "string" && de.trim().length > 0) return de;
  for (const v of Object.values(rec)) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

/** answers-Key-Konvention (questionnaire-form.tsx → saveAnswer(sessionId, block.key, q.id, value)). */
export function answerKey(blockKey: string, questionId: string): string {
  return `${blockKey}.${questionId}`;
}

/**
 * PURE Transform: Fahrplan-Basis + rohe Template-Blocks + diagnosis_schema + answers
 * → typisierter ExitReportInput. Fixture-testbar (MT-1). Defensiv gegen Null-/Fehl-Formen.
 */
export function buildExitReportInput(
  fahrplan: FahrplanInput,
  templateBlocks: unknown,
  diagnosisSchema: unknown,
  answersRaw: unknown,
): ExitReportInput {
  const answers = asRecord(answersRaw) ?? {};

  // 1. owner_dependency-Fragen + Block-Titel aus template.blocks (Array).
  //    Titel-Praezedenz: template.title → (spaeter) fahrplan block_title → blockKey.
  const ownerDepQuestions: OwnerDepQuestion[] = [];
  const blockTitles: Record<string, string> = {};
  const templateBlockKeys: string[] = [];
  for (const b of asArray(templateBlocks)) {
    const br = asRecord(b);
    if (!br) continue;
    const blockKey = typeof br.key === "string" ? br.key : "";
    if (!blockKey) continue;
    templateBlockKeys.push(blockKey);
    const title = pickTitle(br.title);
    if (title) blockTitles[blockKey] = title;
    for (const q of asArray(br.questions)) {
      const qr = asRecord(q);
      if (!qr || qr.owner_dependency !== true) continue;
      const questionId = typeof qr.id === "string" ? qr.id : "";
      if (!questionId) continue;
      const frageId = typeof qr.frage_id === "string" ? qr.frage_id : "";
      const val = answers[answerKey(blockKey, questionId)];
      const answered =
        val !== null && val !== undefined && String(val).trim().length > 0;
      ownerDepQuestions.push({ blockKey, questionId, frageId, answered });
    }
  }

  // 2. Diagnose-Subtopics aus diagnosis_schema.blocks (OBJEKT keyed by Block-Letter,
  //    NICHT Array — MT-0-Grounding: Object.entries, kein .map).
  const diagnosisSubtopics: DiagnosisSubtopic[] = [];
  const schema = asRecord(diagnosisSchema);
  const blocksObj = schema ? asRecord(schema.blocks) : null;
  if (blocksObj) {
    for (const [blockKey, blockVal] of Object.entries(blocksObj)) {
      const bv = asRecord(blockVal);
      if (!bv) continue;
      for (const s of asArray(bv.subtopics)) {
        const sr = asRecord(s);
        if (!sr) continue;
        const key = typeof sr.key === "string" ? sr.key : "";
        diagnosisSubtopics.push({
          blockKey,
          key,
          name: typeof sr.name === "string" ? sr.name : key,
          questionKeys: asArray(sr.question_keys).filter(
            (x): x is string => typeof x === "string",
          ),
        });
      }
    }
  }

  // 3. Block-Titel-Fallback aus der Diagnose (block_title), wo Template keinen liefert.
  for (const fb of fahrplan.blocks) {
    if (fb.block_key && !blockTitles[fb.block_key] && fb.block_title) {
      blockTitles[fb.block_key] = fb.block_title;
    }
  }
  // 4. Letzter Fallback: Template-Block ohne jeglichen Titel → blockKey selbst.
  for (const k of templateBlockKeys) {
    if (!blockTitles[k]) blockTitles[k] = k;
  }

  return {
    sessionId: fahrplan.sessionId,
    fahrplan,
    ownerDepQuestions,
    diagnosisSubtopics,
    answers,
    blockTitles,
  };
}

/**
 * Laedt Fahrplan-Basis (block_diagnosis + quality_report) + capture_session.answers +
 * template.{blocks,diagnosis_schema} und baut den ExitReportInput. Duenner Supabase-Wrapper.
 */
export async function loadExitReportInput(
  client: SupabaseClient,
  sessionId: string,
): Promise<ExitReportInput> {
  const fahrplan = await loadFahrplanInput(client, sessionId);

  const { data: session } = await client
    .from("capture_session")
    .select("template_id, answers")
    .eq("id", sessionId)
    .maybeSingle();

  const templateId = (session as { template_id?: unknown } | null)?.template_id;
  let templateBlocks: unknown = null;
  let diagnosisSchema: unknown = null;
  if (typeof templateId === "string") {
    const { data: tmpl } = await client
      .from("template")
      .select("blocks, diagnosis_schema")
      .eq("id", templateId)
      .maybeSingle();
    templateBlocks = (tmpl as { blocks?: unknown } | null)?.blocks ?? null;
    diagnosisSchema = (tmpl as { diagnosis_schema?: unknown } | null)?.diagnosis_schema ?? null;
  }

  const answersRaw = (session as { answers?: unknown } | null)?.answers ?? {};
  return buildExitReportInput(fahrplan, templateBlocks, diagnosisSchema, answersRaw);
}
