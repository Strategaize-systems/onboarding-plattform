"use server";

// V6.3 SLC-105 MT-6 — Mandanten-Run-Flow Server-Actions fuer Diagnose-Werkzeug.
// V8 SLC-148 MT-6 — Zusaetzlich: finalizeMandantenReport fuer V8-Template.
//
// Drei Actions:
//   - startDiagnoseRun()  → INSERT capture_session(status='open'), redirect /run/[id].
//   - saveDiagnoseDraft() → UPDATE capture_session.answers JSONB pro Antwort.
//   - submitDiagnoseRun() → UPDATE capture_session.status='submitted',
//                           INSERT ai_jobs(payload.capture_session_id),
//                           redirect /bericht-pending.
//
// Auth-Gate: tenant_admin + tenant_kind='partner_client'. Direkt-Kunden
// (tenant_kind='direct_client') erhalten Hinweis-Page (in start/page.tsx).
//
// Answer-Key-Format (abweichend von SLC-005 exit_readiness):
// V6.3 partner_diagnostic-Template hat question.key bereits dotted (z.B.
// "ki_reife.q1"). Light-Pipeline ruft `computeBlockScores(blocks, answers)`
// mit `answers[q.key]` direkt. Daher schreiben wir hier `answers[question.key]`
// direkt — NICHT `${blockKey}.${questionId}` wie capture/block-actions.ts.
//
// Ref: docs/ARCHITECTURE.md V6.3-Section, RPT-280 Migration 093, light-pipeline.ts.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";
import {
  runV8MandantenReportPipeline,
  type V8PipelineResult,
} from "@/workers/condensation/v8-pipeline";
import { trackV8ReportGenerated } from "@/lib/diagnose/telemetry-v8";

const PARTNER_DIAGNOSTIC_SLUG = "partner_diagnostic";
const V8_TEMPLATE_SLUG = "exit-readiness-teaser-v1";
const V8_USAGE_KIND = "mandanten_report_teaser_v1";
// V6.4 SLC-130: Template-Lookup auf "newest version pro slug" umgestellt.
// PARTNER_DIAGNOSTIC_VERSION-Konstante entfernt — Migration 096 fuehrt
// UNIQUE(slug, version) ein, neue capture_sessions referenzieren immer
// die neueste Template-Version per template.created_at DESC.

interface AuthorizedMandant {
  userId: string;
  tenantId: string;
  email: string;
}

/**
 * Auth-Gate fuer Diagnose-Actions. Verlangt eingeloggter tenant_admin
 * in einem `tenant_kind='partner_client'`-Tenant.
 *
 * @returns AuthorizedMandant bei Erfolg, sonst { error }.
 */
async function authorizeMandant(): Promise<
  { mandant: AuthorizedMandant } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return { error: "Profil nicht gefunden" };
  }
  if (profile.role !== "tenant_admin") {
    return { error: "Nur fuer Mandanten-Admin verfuegbar" };
  }
  if (!profile.tenant_id) {
    return { error: "Kein Tenant" };
  }

  // tenant_kind via admin client (Mandant hat RLS-bedingt keinen direkten
  // SELECT auf tenants.tenant_kind in allen Faellen).
  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("tenant_kind")
    .eq("id", profile.tenant_id)
    .single();
  if (!tenantRow || tenantRow.tenant_kind !== "partner_client") {
    return {
      error: "Diagnose nur fuer Mandanten ueber Partner verfuegbar",
    };
  }

  return {
    mandant: {
      userId: user.id,
      tenantId: profile.tenant_id as string,
      email: (profile.email as string | null) ?? user.email ?? "",
    },
  };
}

/**
 * MT-6a-1 — startDiagnoseRun.
 *
 * Verhalten:
 *  - Falls bereits laufende Diagnose (status IN ('open','in_progress')) fuer
 *    diesen Mandanten existiert: Re-Use derselben Session-ID, kein neuer
 *    INSERT.
 *  - Falls eine `submitted` oder `finalized` Diagnose existiert: ebenfalls
 *    Re-Use (Mandant wird in /run/[id] redirected, die Run-Page handlet die
 *    Status-spezifische Weiterleitung).
 *  - Sonst: INSERT neue capture_session.
 *
 * Nach Erfolg: redirect zu /dashboard/diagnose/run/[id].
 */
export async function startDiagnoseRun(
  _formData?: FormData,
): Promise<void> {
  const auth = await authorizeMandant();
  if ("error" in auth) {
    throw new Error(auth.error);
  }
  const { mandant } = auth;

  const admin = createAdminClient();

  // Template partner_diagnostic muss live sein (Migration 093 seedet v1).
  // V6.4 SLC-130: Lookup auf "newest version pro slug" — UNIQUE(slug, version)
  // aus Migration 096 erlaubt mehrere Versions, neue Sessions verwenden immer
  // die juengste (ORDER BY created_at DESC LIMIT 1). Alte Sessions bleiben an
  // ihrer originalen template_id-FK (bericht/page.tsx laedt ueber session.template_id).
  const { data: template, error: templateError } = await admin
    .from("template")
    .select("id, version")
    .eq("slug", PARTNER_DIAGNOSTIC_SLUG)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (templateError || !template) {
    throw new Error(
      `Template ${PARTNER_DIAGNOSTIC_SLUG} nicht gefunden (keine Version live)`,
    );
  }

  // Existierende Session re-use (Multi-Status: open, in_progress, submitted, finalized).
  const { data: existing } = await admin
    .from("capture_session")
    .select("id, status")
    .eq("tenant_id", mandant.tenantId)
    .eq("template_id", template.id)
    .in("status", ["open", "in_progress", "submitted", "finalized"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId: string;
  if (existing?.id) {
    sessionId = existing.id as string;
  } else {
    const { data: created, error: insertError } = await admin
      .from("capture_session")
      .insert({
        tenant_id: mandant.tenantId,
        template_id: template.id,
        template_version: template.version,
        owner_user_id: mandant.userId,
        status: "open",
        // capture_mode='questionnaire' ist Default per MIG-021 nicht gesetzt,
        // aber von Standard-Templates verwendet; V6.3 partner_diagnostic ist
        // ebenfalls Fragebogen-basiert.
        capture_mode: "questionnaire",
        answers: {},
      })
      .select("id")
      .single();
    if (insertError || !created) {
      throw new Error(
        `Diagnose-Start fehlgeschlagen: ${insertError?.message}`,
      );
    }
    sessionId = created.id as string;
  }

  redirect(`/dashboard/diagnose/run/${sessionId}`);
}

/**
 * MT-6a-2 — saveDiagnoseDraft.
 *
 * Speichert eine einzelne Antwort in `capture_session.answers` JSONB.
 * Key = `question.key` direkt (V6.3 partner_diagnostic schon dotted).
 *
 * Idempotent: gleiche key+value erneut zu speichern ist No-Op.
 * RLS: Tenant-Match wird ueber User-Context-Client validiert.
 */
export async function saveDiagnoseDraft(
  sessionId: string,
  questionKey: string,
  value: string,
): Promise<{ error?: string }> {
  const auth = await authorizeMandant();
  if ("error" in auth) return { error: auth.error };
  const { mandant } = auth;

  if (!questionKey || typeof questionKey !== "string") {
    return { error: "questionKey ungueltig" };
  }
  if (typeof value !== "string") {
    return { error: "value muss String sein" };
  }

  const admin = createAdminClient();
  const { data: session, error: sessError } = await admin
    .from("capture_session")
    .select("id, tenant_id, status, answers")
    .eq("id", sessionId)
    .single();
  if (sessError || !session) {
    return { error: "Session nicht gefunden" };
  }
  if (session.tenant_id !== mandant.tenantId) {
    return { error: "Kein Zugriff" };
  }
  if (session.status === "submitted" || session.status === "finalized") {
    return { error: "Diagnose bereits eingereicht — Aenderungen nicht moeglich" };
  }

  const currentAnswers = (session.answers as Record<string, string>) ?? {};
  const updatedAnswers = { ...currentAnswers, [questionKey]: value };

  const newStatus =
    session.status === "open" ? "in_progress" : session.status;

  const { error: updateError } = await admin
    .from("capture_session")
    .update({
      answers: updatedAnswers,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (updateError) {
    return { error: `Speicherfehler: ${updateError.message}` };
  }

  return {};
}

/**
 * MT-6a-3 — submitDiagnoseRun.
 *
 * Setzt capture_session.status='submitted' und enqueuet einen
 * knowledge_unit_condensation-Job mit payload.capture_session_id. Der
 * Worker dispatched ueber template.metadata.usage_kind zur Light-Pipeline
 * (siehe handle-job.ts:tryDispatchSessionPipeline, V6.3 MT-5 + V8 MT-6).
 *
 * Setzt status='pending' damit rpc_claim_next_ai_job_for_type greift.
 * scheduled_at bleibt auf DB-DEFAULT now() (siehe Migration 031 ai_jobs),
 * d.h. der Claim-Loop greift sofort.
 * (SLC-133 MT-5 / F-1 Side-Fix: Kommentar an reales Verhalten angeglichen,
 * vorher war eine queued/scheduled_at-Variante dokumentiert, die nicht zum
 * INSERT-Payload unten passte.)
 */
export async function submitDiagnoseRun(
  sessionId: string,
): Promise<{ error?: string; jobId?: string }> {
  const auth = await authorizeMandant();
  if ("error" in auth) return { error: auth.error };
  const { mandant } = auth;

  const admin = createAdminClient();

  const { data: session, error: sessError } = await admin
    .from("capture_session")
    .select("id, tenant_id, template_id, status, answers")
    .eq("id", sessionId)
    .single();
  if (sessError || !session) {
    return { error: "Session nicht gefunden" };
  }
  if (session.tenant_id !== mandant.tenantId) {
    return { error: "Kein Zugriff" };
  }
  if (session.status === "submitted" || session.status === "finalized") {
    return { error: "Diagnose bereits eingereicht" };
  }

  const answers = (session.answers as Record<string, string>) ?? {};
  if (Object.keys(answers).length === 0) {
    return { error: "Keine Antworten erfasst" };
  }

  // V9.75 Tier-Gate (Schicht 1) — knowledge_unit_condensation verlangt >= blueprint.
  // VOR dem Status-Submit pruefen, damit bei Ablehnung kein Halb-Zustand
  // (status='submitted' ohne Job) entsteht. Fix ISSUE-105: dieser Dispatch-Pfad
  // (neben rpc_create_block_checkpoint) war ungated; der Worker re-gatet zwar via
  // payload.capture_session_id, aber der Dispatch-Gate fehlte (AC-A-2).
  const gate = await assertSessionTierAllows(
    admin,
    sessionId,
    "knowledge_unit_condensation"
  );
  if (!gate.allowed) {
    return {
      error:
        "Diagnose-Verdichtung ist fuer die aktuelle Stufe nicht freigeschaltet (tier_gate_denied)",
    };
  }

  const { error: updateError } = await admin
    .from("capture_session")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (updateError) {
    return { error: `Submit fehlgeschlagen: ${updateError.message}` };
  }

  const { data: job, error: jobError } = await admin
    .from("ai_jobs")
    .insert({
      tenant_id: mandant.tenantId,
      job_type: "knowledge_unit_condensation",
      status: "pending",
      payload: {
        capture_session_id: sessionId,
        source_kind: "diagnose",
      },
      session_tier: gate.tier,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    // Rollback capture_session-Status, damit Mandant erneut submitten kann.
    await admin
      .from("capture_session")
      .update({ status: "in_progress" })
      .eq("id", sessionId);
    return { error: `Job-Enqueue fehlgeschlagen: ${jobError?.message}` };
  }

  redirect(`/dashboard/diagnose/${sessionId}/bericht-pending`);
}

/**
 * V8 SLC-148 MT-6 — finalizeMandantenReport.
 *
 * Vollstaendig synchrone (kein Bedrock / kein LLM) Server-Action, die fuer
 * eine capture_session vom V8-Template `exit-readiness-teaser-v1` den
 * deterministischen Bericht-Snapshot rechnet und in
 * `capture_session.metadata.v8_report_snapshot` persistiert.
 *
 * Per [[feedback-synchronous-llm-no-ai-jobs-insert]]: KEIN ai_jobs-INSERT,
 * KEIN ai_cost_ledger — der gesamte Pfad ist deterministisch und kann direkt
 * im Request-Cycle laufen (~ms statt s). Worker-Path existiert parallel im
 * handle-job-Dispatcher als Forward-Compat.
 *
 * Pre-Conditions:
 *  - Session existiert
 *  - Session.tenant_id == mandant.tenant_id (Auth-Gate, via authorizeMandant)
 *  - Session.status in ('in_progress', 'submitted')  (offene Session, noch
 *    nicht finalized — finalized = bereits durchgelaufen, Re-Run noch erlaubt)
 *  - Template.slug = 'exit-readiness-teaser-v1' UND
 *    Template.metadata.usage_kind = 'mandanten_report_teaser_v1'
 *
 * Setzt KEIN released_for_strategaize_review-Flag (DEC-163-Erweiterung,
 * AC-SLC-148-6) — das passiert ausschliesslich von der V8.1 Lead-Conversion-CTA
 * (BL-134).
 *
 * Setzt capture_session.status='finalized' NACH erfolgreichem Snapshot-Write.
 *
 * @returns { snapshot } bei Erfolg, { error } bei Fehler.
 */
export async function finalizeMandantenReport(
  sessionId: string,
): Promise<
  | { snapshot: V8PipelineResult["snapshot"]; durationMs: number }
  | { error: string }
> {
  const auth = await authorizeMandant();
  if ("error" in auth) return { error: auth.error };
  const { mandant } = auth;

  const admin = createAdminClient();

  const { data: session, error: sessError } = await admin
    .from("capture_session")
    .select(
      "id, tenant_id, template_id, template_version, owner_user_id, status, answers",
    )
    .eq("id", sessionId)
    .single();
  if (sessError || !session) {
    return { error: "Session nicht gefunden" };
  }
  if (session.tenant_id !== mandant.tenantId) {
    return { error: "Kein Zugriff" };
  }
  if (
    session.status !== "in_progress" &&
    session.status !== "submitted" &&
    session.status !== "finalized"
  ) {
    return {
      error: `Diagnose-Status '${session.status as string}' nicht finalisierbar`,
    };
  }

  // Template laden + Usage-Kind verifizieren.
  const { data: template, error: tmplError } = await admin
    .from("template")
    .select("id, slug, version, blocks, metadata")
    .eq("id", session.template_id)
    .single();
  if (tmplError || !template) {
    return {
      error: `Template ${session.template_id as string} nicht gefunden`,
    };
  }
  if (template.slug !== V8_TEMPLATE_SLUG) {
    return {
      error: `finalizeMandantenReport nur fuer Template '${V8_TEMPLATE_SLUG}', erhalten '${template.slug as string}'`,
    };
  }
  const usageKind = (template.metadata as { usage_kind?: string } | null)
    ?.usage_kind;
  if (usageKind !== V8_USAGE_KIND) {
    return {
      error: `Template usage_kind muss '${V8_USAGE_KIND}' sein, erhalten '${usageKind ?? "undefined"}'`,
    };
  }

  // Pipeline ausfuehren — wirft bei Compute- oder Write-Fehler.
  let result: V8PipelineResult;
  try {
    result = await runV8MandantenReportPipeline({
      session: {
        id: session.id as string,
        tenant_id: session.tenant_id as string,
        template_id: session.template_id as string,
        owner_user_id: session.owner_user_id as string,
        answers: (session.answers as Record<string, string> | null) ?? {},
      },
      template: {
        id: template.id as string,
        version: template.version as string,
        blocks: template.blocks,
        metadata: template.metadata as Record<string, unknown> | null,
      },
      adminClient: admin,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Bericht-Berechnung fehlgeschlagen: ${message}` };
  }

  // capture_session.status → 'finalized' (idempotent — Re-Run aus 'finalized'
  // ist erlaubt, ueberschreibt Snapshot mit neuem finalizedAt).
  if (session.status !== "finalized") {
    const { error: statusError } = await admin
      .from("capture_session")
      .update({ status: "finalized", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (statusError) {
      // Snapshot ist persistiert, nur Status-Flip fehlte. Nicht-fatal —
      // Caller sieht Snapshot trotzdem.
      return {
        snapshot: result.snapshot,
        durationMs: result.duration_ms,
      };
    }
  }

  // V8 SLC-152 MT-2 Telemetry-Event — fire-and-forget (fail-silent in der
  // Tracker-Funktion). Erst NACH Snapshot-Persist + Status-Flip, damit das
  // Event "ich habe einen Bericht generiert" semantisch korrekt ist.
  trackV8ReportGenerated(admin, sessionId, session.tenant_id as string);

  return {
    snapshot: result.snapshot,
    durationMs: result.duration_ms,
  };
}
