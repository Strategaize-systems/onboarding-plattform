"use server";

// StB-Vertikale Live-Scoring — Server-Action (SLC-179 MT-1 + MT-3, OP V10.1).
//
// `assessModulAnswer` bewertet EINE Modul-Antwort synchron pro Frage (Founder F-B)
// via Bedrock-Haiku 4.5 (eu-central-1, temp 0), fail-open, und vermerkt bei Bedarf
// einen Trigger-Hit (frage_id) unter
// `capture_session.metadata.modul_delivery_trigger_hits[modulKey]`. SLC-178 liest
// diesen Stand fuer die Reife-Ampel; SLC-180 blendet die Rueckfrage inline ein.
//
// Struktur-Vorbild (1:1): assessAnswerAmpel (blueprint/actions.ts:123) —
//   auth -> tenant -> Session-Ownership -> Template/Frage -> LLM (try/fail-open)
//   -> error_log-Audit (data-residency.md) -> metadata fetch-merge-write (additiv).
// LLM-Adapter: invokeHaiku (src/lib/ai/bedrock-haiku) statt chatWithLLM — der
// Contract verlangt Haiku 4.5 + strict-JSON (zod); der Adapter existiert bereits
// (strategaize-pattern-reuse.md). Kein ai_cost_ledger fuer den Mikro-Call (V1,
// wie ISSUE-107 / assessAnswerAmpel). Guardrail/Heilung: assess-answer-prompt.ts.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTemplateById } from "@/lib/db/template-queries";
import { isValidModulKey } from "@/lib/stb-vertikale/modul-capture";
import {
  invokeHaiku,
  BEDROCK_HAIKU_REGION,
} from "@/lib/ai/bedrock-haiku";
import { MODUL_DELIVERY_TRIGGER_HITS_META_KEY } from "./reife-ampel";
import {
  ModulAnswerAssessmentSchema,
  buildAssessAnswerPrompt,
  computeAssessOutcome,
  type ModulAnswerAssessment,
} from "./assess-answer-prompt";

/** error_log-Source der Audit-Eintraege (data-residency.md Nachweispflicht). */
const ASSESS_AUDIT_SOURCE = "modul_delivery_live_scoring" as const;

/**
 * V10.1 pinnt Haiku 4.5 EXPLIZIT (ISSUE-111): der geteilte ENV
 * `BEDROCK_V9_HAIKU_MODEL_ID` ist in Prod auf eine Sonnet-4-ID gesetzt (V9-Alt-Config)
 * und wird auch vom V9-bulk-email-Pre-Filter gelesen — daher NICHT den ENV aendern,
 * sondern die Modell-ID hier per invokeHaiku-Override durchreichen (F-B: Haiku 4.5
 * fuer geringe Latenz). Region bleibt hardcoded eu-central-1 (data-residency.md).
 * Live-Smoke /deploy V10.1 (RPT-561): in eu-central-1 verfuegbar.
 */
const MODULE_DELIVERY_MODEL_ID =
  "eu.anthropic.claude-haiku-4-5-20251001-v1:0" as const;

/** Modell-Label fuer den Audit-Trail = tatsaechlich aufgerufenes Modell (ISSUE-111). */
const HAIKU_MODEL_LABEL = MODULE_DELIVERY_MODEL_ID;

/** Kleines Token-Budget: Status + eine knappe Rueckfrage (F-B Latenz). */
const ASSESS_MAX_TOKENS = 200;

export type AssessModulAnswerResult =
  | { ok: true; rueckfrage: string | null }
  | { ok: false; error: string };

/**
 * Live-Bewertung einer Modul-Antwort (Choice A, DEC-253/A+F). Non-blocking
 * gedacht: bei LLM-/Parse-/Schema-Fehler fail-open (keine Rueckfrage, kein
 * Trigger-Hit) — die Capture laeuft weiter (AC-179-1). Owner-/Tenant-Check als
 * Defense-in-Depth (RLS greift zusaetzlich).
 *
 * @returns rueckfrage != null  -> Wizard blendet die Rueckfrage inline ein (SLC-180)
 *          rueckfrage == null   -> keine Rueckfrage (ok, geheilt, gekappt oder fail-open)
 */
export async function assessModulAnswer(
  sessionId: string,
  modulKey: string,
  frageId: string,
  answer: string,
): Promise<AssessModulAnswerResult> {
  if (!isValidModulKey(modulKey)) {
    return { ok: false, error: "Ungueltiger Modul-Schluessel" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return { ok: false, error: "Profil/Tenant nicht gefunden" };
  }

  // Defense-in-Depth: Session muss dem eigenen Tenant gehoeren.
  const { data: session } = await supabase
    .from("capture_session")
    .select("tenant_id, template_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Kein Zugriff auf diese Session" };
  }

  // Frage + zugehoerigen Block (fuer Guardrail-Scoping) aus dem Template laden.
  const template = await getTemplateById(supabase, session.template_id);
  if (!template) {
    return { ok: false, error: "Template fuer diese Session nicht gefunden" };
  }
  const block = template.blocks.find((b) =>
    b.questions.some((q) => q.frage_id === frageId),
  );
  const question = block?.questions.find((q) => q.frage_id === frageId);
  if (!block || !question) {
    return { ok: false, error: "Frage nicht gefunden" };
  }
  const blockFrageIds = block.questions.map((q) => q.frage_id);

  const admin = createAdminClient();

  // --- Haiku-Assessment (fail-open) ---
  let assessment: ModulAnswerAssessment | null = null;
  const { system, user: userPrompt } = buildAssessAnswerPrompt(question, answer);
  try {
    const result = await invokeHaiku(
      { system, user: userPrompt },
      ModulAnswerAssessmentSchema,
      { temperature: 0, maxTokens: ASSESS_MAX_TOKENS, modelId: MODULE_DELIVERY_MODEL_ID },
    );
    assessment = result.data;
    await admin.from("error_log").insert({
      level: "info",
      source: ASSESS_AUDIT_SOURCE,
      message: `Live-Scoring ${assessment.status} fuer ${frageId} (session ${sessionId})`,
      metadata: {
        capture_session_id: sessionId,
        modul_key: modulKey,
        frage_id: frageId,
        provider: "aws-bedrock",
        region: result.region,
        model: result.modelId,
        status: assessment.status,
      },
    });
  } catch (e) {
    // fail-open: keine Bewertung -> keine Rueckfrage, kein Trigger-Hit.
    await admin.from("error_log").insert({
      level: "warning",
      source: ASSESS_AUDIT_SOURCE,
      message: `assessModulAnswer LLM-Fehler fuer ${frageId} (fail-open): ${
        e instanceof Error ? e.message : String(e)
      }`,
      metadata: {
        capture_session_id: sessionId,
        modul_key: modulKey,
        frage_id: frageId,
        provider: "aws-bedrock",
        region: BEDROCK_HAIKU_REGION,
        model: HAIKU_MODEL_LABEL,
      },
    });
  }

  // --- Trigger-Hit-Stand lesen (frisch via admin) ---
  const { data: row } = await admin
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .single();
  const currentMeta = (row?.metadata ?? {}) as Record<string, unknown>;
  const triggerHitsMap =
    (currentMeta[MODUL_DELIVERY_TRIGGER_HITS_META_KEY] as
      | Record<string, unknown>
      | undefined) ?? {};
  const rawHits = triggerHitsMap[modulKey];
  const currentTriggerHits: string[] = Array.isArray(rawHits)
    ? rawHits.filter((x): x is string => typeof x === "string")
    : [];

  // --- Guardrail/Heilung (pure) ---
  const outcome = computeAssessOutcome(
    assessment,
    frageId,
    blockFrageIds,
    currentTriggerHits,
  );

  // --- Trigger-Hits nur bei tatsaechlicher Aenderung persistieren (additiv) ---
  if (outcome.nextTriggerHits !== null) {
    await admin
      .from("capture_session")
      .update({
        metadata: {
          ...currentMeta,
          [MODUL_DELIVERY_TRIGGER_HITS_META_KEY]: {
            ...(triggerHitsMap as Record<string, unknown>),
            [modulKey]: outcome.nextTriggerHits,
          },
        },
      })
      .eq("id", sessionId);
  }

  return { ok: true, rueckfrage: outcome.rueckfrage };
}
