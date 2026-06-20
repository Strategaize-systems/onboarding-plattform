"use server";

// V9 SLC-167 MT-6 — Curation Server-Actions (FEAT-073)
// V9.5 SLC-V9.5-D MT-1..3 — Curation-Contract-Shift (DEC-214, FEAT-080):
//   Die Curation operiert ab jetzt auf den konsolidierten
//   email_synthesized_unit-Rows (MIG-111) statt der flachen email_pattern-
//   Fragmente. Der thread-lokale Pseudonym-Lookup im Import ENTFAELLT
//   (Synthese hat P1/P2 entfernt, AC-D-2). Promotion-Target (knowledge_unit-
//   INSERT + Snapshot-Trigger) bleibt strukturell unveraendert (AC-D-1).
//
// Fuenf Aktionen:
//   - getCurationData(bulkRunId): Page-Load — bulk_run + Unit-Liste
//     sortiert nach aggregated_confidence DESC + Sections + Progress-Zahlen.
//   - updateUnitCuration(unit_id, payload): Pro-Unit Akzeptieren/
//     Ablehnen/Editieren + Section-Zuordnung.
//   - bulkAcceptUnits(bulk_run_id, { confidenceThreshold }): Bulk-Aktion
//     "alle aggregated_confidence >= threshold akzeptieren" — UPDATE WHERE
//     pending_curation AND aggregated_confidence >= threshold AND
//     suggested_section IS NOT NULL.
//   - bulkRejectAllUnits(bulk_run_id): UPDATE alle pending_curation → rejected.
//   - finishCurationAndStartHandbookImport(bulk_run_id): GF-Gate-3.
//     Status-Guard akzeptiert 'synthesized' + 'curating' (AC-D-4) →
//     UPDATE email_bulk_run.status='importing'.
//   - importToHandbook(bulk_run_id): Units → knowledge_unit + Snapshot.
//
// Pattern-Reuse:
//   - Auth-Gate (tenant_admin): ../pattern-start/actions.ts authorizeActor
//   - UUID-Validation: ../pattern-start/actions.ts UUID_REGEX
//   - User-Context-SELECT + admin-Client-Trennung: ../filter-review/actions.ts
//   - revalidatePath: ../pattern-start/actions.ts
//   - Section-Lookup: @/lib/bulk-email/sections

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSectionStoreFromSupabase,
  getAvailableSections,
} from "@/lib/bulk-email/sections";
import {
  getOrCreatePseudoBlockCheckpoint,
  mapSynthesizedUnitToKnowledgeUnit,
  triggerHandbookSnapshot,
  type BulkRunForImport,
  type SynthesizedUnitForImport,
} from "@/lib/bulk-email/handbook-import";

import {
  BULK_ACCEPT_DEFAULT_THRESHOLD,
  MAX_EDIT_DESCRIPTION_LENGTH,
  MAX_EDIT_TITLE_LENGTH,
  computeProgress,
  isCurationStatus,
  isValidCuratedSection,
  type BulkAcceptResult,
  type BulkRejectResult,
  type CurationData,
  type CurationUnit,
  type CurationStatus,
  type FinishCurationResult,
  type ImportToHandbookResult,
  type UpdateUnitCurationResult,
} from "./helpers";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ────────────────────────────────────────────────────────────────────────────
// Auth-Gate
// ────────────────────────────────────────────────────────────────────────────

interface AuthorizedActor {
  userId: string;
  tenantId: string;
}

async function authorizeActor(): Promise<
  { actor: AuthorizedActor } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht authentifiziert" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) return { error: "Profil nicht gefunden" };
  if (profile.role !== "tenant_admin") {
    return { error: "Nur Tenant-Admins koennen die Curation bearbeiten" };
  }
  if (!profile.tenant_id) return { error: "Kein Tenant zugeordnet" };

  return {
    actor: { userId: user.id, tenantId: profile.tenant_id as string },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// getCurationData — Page-Load
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lade Bulk-Run-Header + Unit-Liste + Sections + Progress.
 *
 * Sicherheit: User-Context-Client. RLS-Policies email_bulk_run_tenant_select
 * + email_synthesized_unit Tenant-Policies (MIG-111) filtern automatisch
 * nach Tenant.
 *
 * Section-Lookup geht ueber admin-Client (template ist system-weit). Tenant-
 * Filter ist nicht noetig — template-Definitionen sind global.
 *
 * Returns null bei nicht-existent ODER kein-Lese-Zugriff (RLS-Miss).
 */
export async function getCurationData(
  bulkRunId: string,
): Promise<CurationData | null> {
  if (!UUID_REGEX.test(bulkRunId)) return null;

  const auth = await authorizeActor();
  if ("error" in auth) return null;

  const supabase = await createClient();

  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, source_file_name, status, capture_session_id")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError || !runRow) return null;

  // Template-ID via capture_session-JOIN (capture_session.template_id). Wenn
  // capture_session_id null ist (orphan run), faellt der Section-Lookup auf
  // den Default-Slug "exit_readiness" zurueck.
  let templateId: string | null = null;
  if (runRow.capture_session_id) {
    const { data: sessionRow } = await supabase
      .from("capture_session")
      .select("template_id")
      .eq("id", runRow.capture_session_id as string)
      .maybeSingle();
    if (sessionRow && typeof sessionRow.template_id === "string") {
      templateId = sessionRow.template_id;
    }
  }

  const { data: unitRows, error: unitError } = await supabase
    .from("email_synthesized_unit")
    .select(
      "id, title, description, evidence_snippets, themes, aggregated_confidence, evidence_count, source_pattern_ids, suggested_section, curation_status, curated_section, curator_user_id, curated_at",
    )
    .eq("bulk_run_id", bulkRunId)
    .order("aggregated_confidence", { ascending: false });
  if (unitError) return null;

  const units: CurationUnit[] = (unitRows ?? []).map((u) => ({
    id: u.id as string,
    title: u.title as string,
    description: u.description as string,
    evidence_snippets:
      Array.isArray(u.evidence_snippets) ? (u.evidence_snippets as unknown[]) : null,
    themes: Array.isArray(u.themes) ? (u.themes as string[]) : null,
    aggregated_confidence: Number(u.aggregated_confidence),
    evidence_count: Number(u.evidence_count),
    source_pattern_ids: Array.isArray(u.source_pattern_ids)
      ? (u.source_pattern_ids as string[])
      : null,
    suggested_section: (u.suggested_section as string | null) ?? null,
    curation_status: u.curation_status as CurationStatus,
    curated_section: (u.curated_section as string | null) ?? null,
    curator_user_id: (u.curator_user_id as string | null) ?? null,
    curated_at: (u.curated_at as string | null) ?? null,
  }));

  // Sections via admin-Client (template ist global, kein Tenant-Filter noetig).
  const adminClient = createAdminClient();
  const sectionStore = createSectionStoreFromSupabase(adminClient);
  const sections = await getAvailableSections(
    auth.actor.tenantId,
    templateId,
    sectionStore,
  );

  return {
    run: {
      id: runRow.id as string,
      source_file_name: runRow.source_file_name as string,
      status: runRow.status as string,
      capture_session_id: (runRow.capture_session_id as string | null) ?? null,
      template_id: templateId,
    },
    units,
    sections,
    progress: computeProgress(units),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// updateUnitCuration — Pro-Unit UPDATE
// ────────────────────────────────────────────────────────────────────────────

export interface UpdateUnitCurationPayload {
  status: CurationStatus;
  /** Pflicht bei status='accepted' oder 'edited'. */
  curated_section?: string | null;
  /** Optional, nur bei status='edited'. */
  edited_title?: string;
  /** Optional, nur bei status='edited'. */
  edited_description?: string;
}

/**
 * Server-Action: einen einzelnen Unit-Status setzen (akzeptieren/ablehnen/
 * editieren) + Section zuordnen.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID + Payload-Validation.
 *   3. UPDATE email_synthesized_unit SET curation_status, curated_section,
 *      [title, description bei status='edited'], curator_user_id, curated_at.
 *      Tenant-RLS (MIG-111) sichert Tenant-Iso.
 *   4. revalidatePath fuer Curation-Page.
 */
export async function updateUnitCuration(
  unitId: string,
  payload: UpdateUnitCurationPayload,
): Promise<UpdateUnitCurationResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { actor } = auth;

  if (!UUID_REGEX.test(unitId)) {
    return { ok: false, error: "Ungueltige unit_id" };
  }
  if (!isCurationStatus(payload.status)) {
    return { ok: false, error: "Ungueltiger curation_status" };
  }

  // Section-Pflicht bei accepted/edited
  if (payload.status === "accepted" || payload.status === "edited") {
    if (!payload.curated_section || !isValidCuratedSection(payload.curated_section)) {
      return {
        ok: false,
        error:
          "Section ist Pflicht bei Akzeptieren/Editieren (Free-Text-Sentinel nicht erlaubt)",
      };
    }
  }

  // Edit-Validation
  if (payload.status === "edited") {
    if (
      payload.edited_title !== undefined &&
      (typeof payload.edited_title !== "string" ||
        payload.edited_title.trim().length === 0 ||
        payload.edited_title.length > MAX_EDIT_TITLE_LENGTH)
    ) {
      return { ok: false, error: "Ungueltiger edited_title" };
    }
    if (
      payload.edited_description !== undefined &&
      (typeof payload.edited_description !== "string" ||
        payload.edited_description.trim().length === 0 ||
        payload.edited_description.length > MAX_EDIT_DESCRIPTION_LENGTH)
    ) {
      return { ok: false, error: "Ungueltiger edited_description" };
    }
  }

  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    curation_status: payload.status,
    curator_user_id: actor.userId,
    curated_at: new Date().toISOString(),
  };
  if (payload.curated_section !== undefined) {
    updatePayload.curated_section = payload.curated_section ?? null;
  }
  if (payload.status === "edited") {
    if (payload.edited_title !== undefined) {
      updatePayload.title = payload.edited_title;
    }
    if (payload.edited_description !== undefined) {
      updatePayload.description = payload.edited_description;
    }
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("email_synthesized_unit")
    .update(updatePayload)
    .eq("id", unitId)
    .select("id, bulk_run_id")
    .maybeSingle();
  if (updateError) {
    return {
      ok: false,
      error: `UPDATE fehlgeschlagen: ${updateError.message}`,
    };
  }
  if (!updatedRow) {
    return {
      ok: false,
      error: "Unit nicht gefunden oder kein Schreibzugriff (RLS-Block)",
    };
  }

  revalidatePath(
    `/dashboard/bulk-email-import/${updatedRow.bulk_run_id as string}/curation`,
  );
  return { ok: true, unitId: updatedRow.id as string };
}

// ────────────────────────────────────────────────────────────────────────────
// bulkAcceptUnits — Bulk-Aktion "alle aggregated_confidence >= threshold"
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: alle pending Units mit aggregated_confidence >= threshold
 * akzeptieren.
 *
 * Nur Units mit suggested_section IS NOT NULL werden akzeptiert — sonst
 * fehlt die Section-Pflicht und der GF muesste manuell nacheditieren.
 *
 * Spec L189: "Bulk-Aktion 'alle confidence >0.8 akzeptieren'". Wir nutzen >=
 * statt >, weil exakte 0.8 ein realistischer Wert ist und der GF erwartet,
 * dass die Schwelle inklusiv ist.
 */
export async function bulkAcceptUnits(
  bulkRunId: string,
  options: { confidenceThreshold?: number } = {},
): Promise<BulkAcceptResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { actor } = auth;

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }
  const threshold = options.confidenceThreshold ?? BULK_ACCEPT_DEFAULT_THRESHOLD;
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    return { ok: false, error: "confidenceThreshold muss in [0, 1] liegen" };
  }

  const supabase = await createClient();

  // Bulk-UPDATE: WHERE bulk_run_id + pending_curation +
  //              aggregated_confidence >= threshold + suggested_section NOT NULL.
  // curated_section = suggested_section (1:1 Uebernahme).
  // Wir muessen die qualifizierten Rows zuerst SELECTen, weil Supabase keine
  // SQL-Expression in UPDATE-Werten erlaubt (curated_section = suggested_section
  // braucht zwei Schritte: SELECT, dann Iterate-UPDATE pro Row).
  const { data: candidateRows, error: selectError } = await supabase
    .from("email_synthesized_unit")
    .select("id, suggested_section")
    .eq("bulk_run_id", bulkRunId)
    .eq("curation_status", "pending_curation")
    .not("suggested_section", "is", null)
    .gte("aggregated_confidence", threshold);
  if (selectError) {
    return {
      ok: false,
      error: `SELECT fehlgeschlagen: ${selectError.message}`,
    };
  }
  const candidates = (candidateRows ?? []) as Array<{
    id: string;
    suggested_section: string;
  }>;
  if (candidates.length === 0) {
    return { ok: true, acceptedCount: 0 };
  }

  const nowIso = new Date().toISOString();
  let acceptedCount = 0;
  for (const c of candidates) {
    const { error: updateError, count } = await supabase
      .from("email_synthesized_unit")
      .update(
        {
          curation_status: "accepted",
          curated_section: c.suggested_section,
          curator_user_id: actor.userId,
          curated_at: nowIso,
        },
        { count: "exact" },
      )
      .eq("id", c.id)
      .eq("curation_status", "pending_curation"); // Race-Safety
    if (updateError) {
      return {
        ok: false,
        error: `Bulk-UPDATE abgebrochen bei ${c.id} (${acceptedCount} bereits akzeptiert): ${updateError.message}`,
      };
    }
    acceptedCount += count ?? 0;
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/curation`);
  return { ok: true, acceptedCount };
}

// ────────────────────────────────────────────────────────────────────────────
// bulkRejectAllUnits — alle pending → rejected
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: alle pending_curation-Units dieses Runs als rejected
 * markieren. Brauchbar fuer "Run komplett verwerfen ohne Handbuch-Import".
 */
export async function bulkRejectAllUnits(
  bulkRunId: string,
): Promise<BulkRejectResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { actor } = auth;

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }

  const supabase = await createClient();
  const { error: updateError, count } = await supabase
    .from("email_synthesized_unit")
    .update(
      {
        curation_status: "rejected",
        curator_user_id: actor.userId,
        curated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("bulk_run_id", bulkRunId)
    .eq("curation_status", "pending_curation");
  if (updateError) {
    return {
      ok: false,
      error: `Bulk-Reject UPDATE fehlgeschlagen: ${updateError.message}`,
    };
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/curation`);
  return { ok: true, rejectedCount: count ?? 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// finishCurationAndStartHandbookImport — GF-Gate-3
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: Curation als abgeschlossen markieren und Handbook-Import
 * triggern.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID-Validation.
 *   3. Status-Pre-Check 'synthesized' oder 'curating' (AC-D-4 — die Synthese-
 *      Stage SLC-V9.5-B flippt den Run auf 'synthesized'; 'curating' bleibt
 *      als expliziter Zwischen-Status akzeptiert).
 *   4. Mindestens 1 Unit mit curation_status IN ('accepted', 'edited').
 *      Sonst macht Import keinen Sinn.
 *   5. UPDATE email_bulk_run.status='importing'.
 *   6. revalidatePath.
 *   7. Return mit Hinweis-Text — CurationClient chained importToHandbook.
 */
export async function finishCurationAndStartHandbookImport(
  bulkRunId: string,
): Promise<FinishCurationResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }

  const supabase = await createClient();

  // Status-Pre-Check
  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, status")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError) {
    return {
      ok: false,
      error: `Bulk-Run-Lookup fehlgeschlagen: ${runError.message}`,
    };
  }
  if (!runRow) {
    return { ok: false, error: "Bulk-Run nicht gefunden" };
  }
  const status = runRow.status as string;
  if (status !== "synthesized" && status !== "curating") {
    return {
      ok: false,
      error: `Abschluss nicht moeglich — Status ist '${status}', erwartet 'synthesized' oder 'curating'`,
    };
  }

  // Mindestens 1 akzeptierte/editierte Unit
  const { count: acceptedCount, error: countError } = await supabase
    .from("email_synthesized_unit")
    .select("id", { count: "exact", head: true })
    .eq("bulk_run_id", bulkRunId)
    .in("curation_status", ["accepted", "edited"]);
  if (countError) {
    return {
      ok: false,
      error: `Unit-Count fehlgeschlagen: ${countError.message}`,
    };
  }
  if (!acceptedCount || acceptedCount === 0) {
    return {
      ok: false,
      error:
        "Keine akzeptierte Unit vorhanden — Curation abschliessen ist erst nach mindestens 1 Akzept moeglich",
    };
  }

  // Status-Flip
  const { error: updateError } = await supabase
    .from("email_bulk_run")
    .update({
      status: "importing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (updateError) {
    return {
      ok: false,
      error: `Status-UPDATE fehlgeschlagen: ${updateError.message}`,
    };
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/curation`);
  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}`);

  // Status-Flip durch. importToHandbook laeuft als separate Server-Action —
  // CurationClient.tsx chained beide Calls. Diese Funktion bleibt rein
  // Status-Flip + Pre-Conditions-Validation, damit der bestehende
  // Pre-Check-Contract (Tests + Code) stabil bleibt.
  return {
    ok: true,
    handbookImportStarted: false,
    pendingMessage:
      "Status auf 'importing' gesetzt. CurationClient triggert nun importToHandbook.",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// importToHandbook — Units → knowledge_unit + Snapshot (FEAT-074 / FEAT-080)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: konvertiert akzeptierte/editierte Units in knowledge_unit-
 * Rows + triggert handbook_snapshot. Aufgerufen unmittelbar nach
 * finishCurationAndStartHandbookImport (UI-Chain) oder als manueller Re-Try
 * nach Status='failed'.
 *
 * Path-A-Lite (DEC-193) — Target unveraendert (AC-D-1):
 *   - Pseudo-block_checkpoint pro Bulk-Run (idempotent via content_hash)
 *   - knowledge_unit-INSERT mit Source-Attribution im body als Markdown +
 *     parallel als metadata JSONB
 *   - email_synthesized_unit.imported_to_handbook_at = now() +
 *     imported_knowledge_unit_id
 *   - triggerHandbookSnapshot via RPC rpc_trigger_handbook_snapshot
 *   - Worker handle-snapshot-job.ts pickt asynchron und rendert ZIP
 *
 * SLC-V9.5-D (AC-D-2): KEIN email_thread/participant_pseudonyms-Lookup mehr —
 * die Synthese hat P1/P2 bereits entfernt; Attribution via source_pattern_ids
 * + evidence_count.
 *
 * Idempotenz:
 *   - imported_to_handbook_at IS NULL filtert bereits importierte Units
 *   - Pseudo-Checkpoint via content_hash=sha256(bulk_run_id) deduped
 *
 * Failure-Pfad (Snapshot-Trigger oder mid-Loop):
 *   - ROLLBACK: DELETE knowledge_unit-Rows + UPDATE
 *     email_synthesized_unit.imported_to_* auf NULL fuer alle insertierten Units
 *   - UPDATE bulk_run.status='failed', failure_reason
 *   - Re-Run via dieser Action ist moeglich (status='failed' akzeptiert)
 *
 * Uses createAdminClient() fuer den I/O-Pfad — wir bypassen RLS bewusst weil:
 *   (a) bulk-INSERT in knowledge_unit (V4.1-RLS hat keine direkte INSERT-Policy
 *       fuer tenant_admin Cross-Pfad)
 *   (b) RPC trigger ist SECURITY DEFINER — funktioniert auch mit user_client,
 *       aber wir behalten admin-Client fuer den ganzen Lauf konsistent
 *   (c) Cross-Tenant-Schutz ist ueber Auth-Gate + tenant_id-Check im run-Load
 *       sichergestellt
 */
export async function importToHandbook(
  bulkRunId: string,
): Promise<ImportToHandbookResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }

  const adminClient = createAdminClient();

  // 1. Lade Bulk-Run + Cross-Tenant-Schutz
  const { data: runRow, error: runError } = await adminClient
    .from("email_bulk_run")
    .select(
      "id, tenant_id, capture_session_id, source_file_name, status",
    )
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError) {
    return {
      ok: false,
      error: `Bulk-Run-Lookup fehlgeschlagen: ${runError.message}`,
    };
  }
  if (!runRow) {
    return { ok: false, error: "Bulk-Run nicht gefunden" };
  }
  if (runRow.tenant_id !== auth.actor.tenantId) {
    return { ok: false, error: "Forbidden — Cross-Tenant" };
  }

  // 2. Status-Pre-Check: 'importing' (Vorlauf via finishCuration) ODER 'failed'
  //    (Re-Try nach handbook_import_error / handbook_snapshot_trigger_failed)
  const status = runRow.status as string;
  if (status !== "importing" && status !== "failed") {
    return {
      ok: false,
      error: `Status '${status}', erwartet 'importing' oder 'failed' fuer Re-Try`,
    };
  }

  const captureSessionId = runRow.capture_session_id as string | null;
  if (!captureSessionId) {
    return {
      ok: false,
      error:
        "Bulk-Run hat keine capture_session_id — Handbuch-Import nicht moeglich",
    };
  }

  // 3. Lade pending Units (accepted/edited mit Section + nicht-importiert)
  const { data: unitRows, error: unitError } = await adminClient
    .from("email_synthesized_unit")
    .select(
      "id, title, description, evidence_snippets, themes, aggregated_confidence, evidence_count, source_pattern_ids, curated_section, created_at, curator_user_id",
    )
    .eq("bulk_run_id", bulkRunId)
    .in("curation_status", ["accepted", "edited"])
    .is("imported_to_handbook_at", null)
    .not("curated_section", "is", null);
  if (unitError) {
    return {
      ok: false,
      error: `Unit-SELECT fehlgeschlagen: ${unitError.message}`,
    };
  }
  const units = (unitRows ?? []) as Array<{
    id: string;
    title: string;
    description: string;
    evidence_snippets: unknown[] | null;
    themes: string[] | null;
    aggregated_confidence: number;
    evidence_count: number;
    source_pattern_ids: string[] | null;
    curated_section: string;
    created_at: string;
    curator_user_id: string | null;
  }>;

  const bulkRunForImport: BulkRunForImport = {
    id: runRow.id as string,
    tenant_id: runRow.tenant_id as string,
    capture_session_id: captureSessionId,
    source_file_name: runRow.source_file_name as string,
  };

  // 4. Re-Run-Idempotenz: keine pending Units → Status auf 'completed' (nur
  //    falls noch nicht), kein 2. Snapshot-Trigger, kein Pseudo-Checkpoint.
  if (units.length === 0) {
    const { error: completeError } = await adminClient
      .from("email_bulk_run")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
    if (completeError) {
      return {
        ok: false,
        error: `Status-UPDATE (idempotent-completed) fehlgeschlagen: ${completeError.message}`,
      };
    }
    revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/curation`);
    revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}`);
    return {
      ok: true,
      unitsImported: 0,
      knowledgeUnitsCreated: 0,
      handbookSnapshotId: "",
    };
  }

  // 5. Get-or-create Pseudo-block_checkpoint
  const checkpointResult = await getOrCreatePseudoBlockCheckpoint(adminClient, {
    captureSessionId,
    bulkRunId,
    tenantId: runRow.tenant_id as string,
    createdByUserId: auth.actor.userId,
  });
  if (!checkpointResult.ok) {
    return { ok: false, error: checkpointResult.error };
  }
  const blockCheckpointId = checkpointResult.blockCheckpointId;

  // 6. Loop: INSERT knowledge_unit + UPDATE email_synthesized_unit
  const insertedKuIds: string[] = [];
  const insertedUnitIds: string[] = [];

  async function rollbackLoop(failureReason: string): Promise<void> {
    if (insertedKuIds.length > 0) {
      await adminClient
        .from("knowledge_unit")
        .delete()
        .in("id", insertedKuIds);
    }
    if (insertedUnitIds.length > 0) {
      await adminClient
        .from("email_synthesized_unit")
        .update({
          imported_to_handbook_at: null,
          imported_knowledge_unit_id: null,
        })
        .in("id", insertedUnitIds);
    }
    await adminClient
      .from("email_bulk_run")
      .update({
        status: "failed",
        failure_reason: failureReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
  }

  for (const unit of units) {
    const unitForImport: SynthesizedUnitForImport = {
      id: unit.id,
      title: unit.title,
      description: unit.description,
      evidence_snippets: unit.evidence_snippets,
      themes: unit.themes,
      aggregated_confidence: Number(unit.aggregated_confidence),
      evidence_count: Number(unit.evidence_count),
      source_pattern_ids: unit.source_pattern_ids,
      curated_section: unit.curated_section,
    };

    let insertInput;
    try {
      insertInput = mapSynthesizedUnitToKnowledgeUnit({
        unit: unitForImport,
        bulkRun: bulkRunForImport,
        captureSessionId,
        blockCheckpointId,
        curatorUserId: unit.curator_user_id ?? auth.actor.userId,
        extractedAt: unit.created_at,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await rollbackLoop("handbook_import_mapper_error");
      return {
        ok: false,
        error: `Mapper-Fehler bei unit ${unit.id}: ${msg}`,
      };
    }

    const { data: kuRow, error: kuInsertError } = await adminClient
      .from("knowledge_unit")
      .insert(insertInput)
      .select("id")
      .single();
    if (kuInsertError || !kuRow) {
      await rollbackLoop("handbook_import_ku_insert_error");
      return {
        ok: false,
        error: `knowledge_unit INSERT (unit ${unit.id}): ${kuInsertError?.message ?? "unknown"}`,
      };
    }
    insertedKuIds.push(kuRow.id as string);

    const { error: unitUpdateError } = await adminClient
      .from("email_synthesized_unit")
      .update({
        imported_to_handbook_at: new Date().toISOString(),
        imported_knowledge_unit_id: kuRow.id,
      })
      .eq("id", unit.id);
    if (unitUpdateError) {
      await rollbackLoop("handbook_import_unit_update_error");
      return {
        ok: false,
        error: `email_synthesized_unit UPDATE (unit ${unit.id}): ${unitUpdateError.message}`,
      };
    }
    insertedUnitIds.push(unit.id);
  }

  // 7. Snapshot-Trigger
  const snapshotResult = await triggerHandbookSnapshot(
    adminClient,
    captureSessionId,
  );
  if (!snapshotResult.ok) {
    await rollbackLoop("handbook_snapshot_trigger_failed");
    return {
      ok: false,
      error: `Snapshot-Trigger fehlgeschlagen: ${snapshotResult.error}`,
    };
  }

  // 8. Final-Status-UPDATE: 'completed' + Stats
  const { error: finalUpdateError } = await adminClient
    .from("email_bulk_run")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      patterns_imported: units.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (finalUpdateError) {
    // Snapshot ist schon getriggert — Rollback waere inkonsistent. Stattdessen
    // status='failed' setzen mit klarer Fehlermeldung; Re-Run wuerde via
    // imported_to_handbook_at IS NULL-Filter 0 Units finden und idempotent
    // den Status auf 'completed' setzen.
    return {
      ok: false,
      error: `Final-Status-UPDATE fehlgeschlagen (Snapshot ${snapshotResult.handbookSnapshotId} ist getriggert): ${finalUpdateError.message}`,
    };
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/curation`);
  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}`);
  revalidatePath(`/dashboard/handbook`);

  return {
    ok: true,
    unitsImported: units.length,
    knowledgeUnitsCreated: insertedKuIds.length,
    handbookSnapshotId: snapshotResult.handbookSnapshotId,
  };
}
