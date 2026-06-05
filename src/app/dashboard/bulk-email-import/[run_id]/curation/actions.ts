"use server";

// V9 SLC-167 MT-6 — Curation Server-Actions (FEAT-073)
//
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-6 Expected behavior L184-198)
// DECs: DEC-181 ("Andere..."-Free-Text-Section)
//
// Fuenf Aktionen:
//   - getCurationData(bulkRunId): Page-Load — bulk_run + email_pattern-Liste
//     sortiert nach confidence DESC + verfuegbare Sections + Progress-Zahlen.
//   - updatePatternCuration(pattern_id, payload): Pro-Pattern Akzeptieren/
//     Ablehnen/Editieren + Section-Zuordnung.
//   - bulkAcceptPatterns(bulk_run_id, { confidenceThreshold }): Bulk-Aktion
//     "alle confidence >= threshold akzeptieren" — UPDATE WHERE pending_curation
//     AND confidence >= threshold AND suggested_section IS NOT NULL.
//   - bulkRejectAll(bulk_run_id): UPDATE alle pending_curation → rejected.
//   - finishCurationAndStartHandbookImport(bulk_run_id): GF-Gate-3.
//     UPDATE email_bulk_run.status='importing' (SLC-167-Scope) + Hinweis dass
//     SLC-168 Handbook-Import-Worker noch nicht implementiert ist.
//
// Pattern-Reuse:
//   - Auth-Gate (tenant_admin): ../pattern-start/actions.ts authorizeActor
//   - UUID-Validation: ../pattern-start/actions.ts UUID_REGEX
//   - User-Context-SELECT + admin-Client-Trennung: ../filter-review/actions.ts
//   - revalidatePath: ../pattern-start/actions.ts
//   - Section-Lookup: @/lib/bulk-email/sections (MT-6 NEU)

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSectionStoreFromSupabase,
  getAvailableSections,
} from "@/lib/bulk-email/sections";

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
  type CurationPattern,
  type CurationStatus,
  type FinishCurationResult,
  type UpdatePatternCurationResult,
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
 * Lade Bulk-Run-Header + Pattern-Liste + Sections + Progress.
 *
 * Sicherheit: User-Context-Client. RLS-Policies email_bulk_run_tenant_select
 * + email_pattern_tenant_select filtern automatisch nach Tenant.
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

  const { data: patternRows, error: patternError } = await supabase
    .from("email_pattern")
    .select(
      "id, thread_id, title, description, evidence_snippets, themes, confidence, suggested_section, curation_status, curated_section, curator_user_id, curated_at",
    )
    .eq("bulk_run_id", bulkRunId)
    .order("confidence", { ascending: false });
  if (patternError) return null;

  const patterns: CurationPattern[] = (patternRows ?? []).map((p) => ({
    id: p.id as string,
    thread_id: p.thread_id as string,
    title: p.title as string,
    description: p.description as string,
    evidence_snippets:
      Array.isArray(p.evidence_snippets) ? (p.evidence_snippets as unknown[]) : null,
    themes: Array.isArray(p.themes) ? (p.themes as string[]) : null,
    confidence: Number(p.confidence),
    suggested_section: (p.suggested_section as string | null) ?? null,
    curation_status: p.curation_status as CurationStatus,
    curated_section: (p.curated_section as string | null) ?? null,
    curator_user_id: (p.curator_user_id as string | null) ?? null,
    curated_at: (p.curated_at as string | null) ?? null,
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
    patterns,
    sections,
    progress: computeProgress(patterns),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// updatePatternCuration — Pro-Pattern UPDATE
// ────────────────────────────────────────────────────────────────────────────

export interface UpdatePatternCurationPayload {
  status: CurationStatus;
  /** Pflicht bei status='accepted' oder 'edited'. */
  curated_section?: string | null;
  /** Optional, nur bei status='edited'. */
  edited_title?: string;
  /** Optional, nur bei status='edited'. */
  edited_description?: string;
}

/**
 * Server-Action: einen einzelnen Pattern-Status setzen (akzeptieren/ablehnen/
 * editieren) + Section zuordnen.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID + Payload-Validation.
 *   3. UPDATE email_pattern SET curation_status, curated_section,
 *      [title, description bei status='edited'], curator_user_id, curated_at.
 *      RLS-Policy email_pattern_tenant_update sichert Tenant-Iso.
 *   4. revalidatePath fuer Curation-Page.
 */
export async function updatePatternCuration(
  patternId: string,
  payload: UpdatePatternCurationPayload,
): Promise<UpdatePatternCurationResult> {
  const auth = await authorizeActor();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { actor } = auth;

  if (!UUID_REGEX.test(patternId)) {
    return { ok: false, error: "Ungueltige pattern_id" };
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
    .from("email_pattern")
    .update(updatePayload)
    .eq("id", patternId)
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
      error: "Pattern nicht gefunden oder kein Schreibzugriff (RLS-Block)",
    };
  }

  revalidatePath(
    `/dashboard/bulk-email-import/${updatedRow.bulk_run_id as string}/curation`,
  );
  return { ok: true, patternId: updatedRow.id as string };
}

// ────────────────────────────────────────────────────────────────────────────
// bulkAcceptPatterns — Bulk-Aktion "alle confidence >= threshold akzeptieren"
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: alle pending Patterns mit confidence >= threshold akzeptieren.
 *
 * Nur Patterns mit suggested_section IS NOT NULL werden akzeptiert — sonst
 * fehlt die Section-Pflicht und der GF muesste manuell nacheditieren.
 *
 * Spec L189: "Bulk-Aktion 'alle confidence >0.8 akzeptieren'". Wir nutzen >=
 * statt >, weil exakte 0.8 ein realistischer Wert ist und der GF erwartet,
 * dass die Schwelle inklusiv ist.
 */
export async function bulkAcceptPatterns(
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

  // Bulk-UPDATE: WHERE bulk_run_id + pending_curation + confidence >= threshold
  //              + suggested_section IS NOT NULL.
  // curated_section = suggested_section (1:1 Uebernahme).
  // Wir muessen die qualifizierten Rows zuerst SELECTen, weil Supabase keine
  // SQL-Expression in UPDATE-Werten erlaubt (curated_section = suggested_section
  // braucht in zwei Schritten: SELECT, dann Iterate-UPDATE pro Row).
  const { data: candidateRows, error: selectError } = await supabase
    .from("email_pattern")
    .select("id, suggested_section")
    .eq("bulk_run_id", bulkRunId)
    .eq("curation_status", "pending_curation")
    .not("suggested_section", "is", null)
    .gte("confidence", threshold);
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
      .from("email_pattern")
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
// bulkRejectAll — alle pending → rejected
// ────────────────────────────────────────────────────────────────────────────

/**
 * Server-Action: alle pending_curation-Patterns dieses Runs als rejected
 * markieren. Brauchbar fuer "Run komplett verwerfen ohne Handbuch-Import".
 */
export async function bulkRejectAll(
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
    .from("email_pattern")
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
 * triggern (SLC-168).
 *
 * SLC-167-Scope (Spec L191): UPDATE email_bulk_run.status='importing' +
 * Hinweis-Text, dass SLC-168-Handbook-Import-Worker noch nicht implementiert
 * ist. Bei kombiniertem Worktree (V9 vollstaendig) wird SLC-168 die
 * tatsaechliche Import-Action triggern und handbookImportStarted=true setzen.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID-Validation.
 *   3. Status-Pre-Check 'pattern_extracted' oder 'curating' (siehe MIG-051
 *      status-Werte). Wir akzeptieren beide weil V9.0 noch kein expliziter
 *      Status-Sprung von 'pattern_extracted' → 'curating' beim Curation-Start
 *      gemacht hat.
 *   4. Mindestens 1 Pattern mit curation_status IN ('accepted', 'edited').
 *      Sonst macht Import keinen Sinn.
 *   5. UPDATE email_bulk_run.status='importing'.
 *   6. revalidatePath.
 *   7. Return mit Hinweis-Text (SLC-167-Scope).
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
  if (status !== "pattern_extracted" && status !== "curating") {
    return {
      ok: false,
      error: `Abschluss nicht moeglich — Status ist '${status}', erwartet 'pattern_extracted' oder 'curating'`,
    };
  }

  // Mindestens 1 akzeptiertes/editiertes Pattern
  const { count: acceptedCount, error: countError } = await supabase
    .from("email_pattern")
    .select("id", { count: "exact", head: true })
    .eq("bulk_run_id", bulkRunId)
    .in("curation_status", ["accepted", "edited"]);
  if (countError) {
    return {
      ok: false,
      error: `Pattern-Count fehlgeschlagen: ${countError.message}`,
    };
  }
  if (!acceptedCount || acceptedCount === 0) {
    return {
      ok: false,
      error:
        "Kein akzeptiertes Pattern vorhanden — Curation abschliessen ist erst nach mindestens 1 Akzept moeglich",
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

  // SLC-167-Scope: nur Status-Flip + Hinweis. SLC-168 wird den eigentlichen
  // Handbook-Import-Worker enqueuen + handbookImportStarted=true setzen.
  return {
    ok: true,
    handbookImportStarted: false,
    pendingMessage:
      "Status auf 'importing' gesetzt. Der Handbook-Import-Worker (SLC-168) ist noch nicht implementiert — die akzeptierten Patterns warten in der DB auf den SLC-168-Sync.",
  };
}
