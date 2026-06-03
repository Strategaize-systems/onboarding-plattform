"use server";

// V9 SLC-166 MT-3 — Filter-Review Server-Actions.
//
// Drei Aktionen:
//   - getFilterReviewData(bulkRunId): Page-Load — bulk_run + alle email_message
//     + Klassifikations-Counts. RLS via user-context Supabase-Client (Tenant-
//     Isolation, strategaize_admin sieht alle).
//   - updateEmailClassifications(bulkRunId, updates): Pro-Email oder Bulk-
//     Reclassify. UPDATE email_message.pre_filter_label + pre_filter_corrected
//     = true. RLS via user-context Client; tenant_member kann nicht updaten
//     (Policy email_message_tenant_update erlaubt nur tenant_admin per
//     auth.user_role()-Helper).
//   - approvePreFilterAndStartThreadRedact(bulkRunId): GF-Gate-1 per DEC-178.
//     Pre-Check bulk_run.status='pre_filtered'. INSERT ai_jobs(job_type=
//     'email_bulk_thread_redact'). Status-Update bleibt dem Worker ueberlassen
//     (Worker setzt 'thread_redacting' analog handle-pre-filter-job.ts).
//
// Auth-Gate: tenant_admin only. Pattern aus SLC-165 MT-4
// uploadBulkEmailRun: authorize... + role !== 'tenant_admin' → error.
//
// Pattern-Reuse:
//   - Auth-Gate + profile-SELECT: ../actions.ts:authorizeBulkEmailUploader
//   - ai_jobs INSERT via admin-Client: same file uploadBulkEmailRun L261-266
//   - revalidatePath: src/app/dashboard/diagnose/actions.ts:submitDiagnoseRun

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  JOB_TYPE_EMAIL_BULK_THREAD_REDACT,
  MAX_UPDATES_PER_CALL,
  PRE_FILTER_LABELS,
  emptyClassificationCounts,
  isValidClassificationUpdate,
  type ApprovePreFilterResult,
  type ClassificationCounts,
  type EmailReviewItem,
  type FilterReviewData,
  type PreFilterLabel,
  type UpdateClassificationsResult,
} from "./helpers";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuthorizedReviewer {
  userId: string;
  tenantId: string;
}

/**
 * Auth-Gate: nur eingeloggter tenant_admin (GF) darf Klassifikationen aendern
 * oder den Approval-Trigger ausloesen. strategaize_admin SELECT-only per RLS,
 * UPDATE/INSERT-Policies erlauben nur eigenen Tenant.
 */
async function authorizeReviewer(): Promise<
  { reviewer: AuthorizedReviewer } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { error: "Profil nicht gefunden" };
  }
  if (profile.role !== "tenant_admin") {
    return {
      error: "Nur Tenant-Admins koennen die Klassifikation anpassen",
    };
  }
  if (!profile.tenant_id) {
    return { error: "Kein Tenant zugeordnet" };
  }

  return {
    reviewer: {
      userId: user.id,
      tenantId: profile.tenant_id as string,
    },
  };
}

/**
 * Lade Bulk-Run-Header + alle email_message-Rows + Klassifikations-Counts.
 *
 * Sicherheit: User-Context-Client. RLS-Policy `email_bulk_run_tenant_select`
 * + `email_message_tenant_select` filtern automatisch nach Tenant. Kein
 * service_role-Bypass noetig — Page-Daten brauchen keine elevation.
 *
 * Returns null bei nicht-existent ODER kein-Lese-Zugriff (RLS-Miss):
 *   - notFound() in der Page (kein Cross-Tenant-Existenz-Leak)
 */
export async function getFilterReviewData(
  bulkRunId: string,
): Promise<FilterReviewData | null> {
  if (!UUID_REGEX.test(bulkRunId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, source_file_name, status, email_count")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError || !runRow) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from("email_message")
    .select(
      "id, subject, from_address, body_text, pre_filter_label, pre_filter_confidence, pre_filter_corrected",
    )
    .eq("bulk_run_id", bulkRunId)
    .not("pre_filter_label", "is", null)
    .order("subject", { ascending: true, nullsFirst: false });
  if (itemsError) return null;

  const items: EmailReviewItem[] = (itemRows ?? []).map((r) => ({
    id: r.id as string,
    subject: (r.subject as string | null) ?? null,
    from_address: (r.from_address as string | null) ?? null,
    body_text: (r.body_text as string | null) ?? null,
    pre_filter_label: r.pre_filter_label as PreFilterLabel,
    pre_filter_confidence:
      r.pre_filter_confidence != null ? Number(r.pre_filter_confidence) : null,
    pre_filter_corrected: Boolean(r.pre_filter_corrected),
  }));

  const counts: ClassificationCounts = emptyClassificationCounts();
  for (const item of items) {
    counts[item.pre_filter_label] = (counts[item.pre_filter_label] ?? 0) + 1;
  }

  return {
    run: {
      id: runRow.id as string,
      source_file_name: runRow.source_file_name as string,
      status: runRow.status as string,
      email_count: Number(runRow.email_count ?? items.length),
    },
    items,
    counts,
  };
}

/**
 * Server-Action: Klassifikations-Updates persistieren.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. Input-Validation (UUID, Array, max-Length, jedes Element valider Label).
 *   3. Pro-Update: UPDATE email_message.pre_filter_label + pre_filter_corrected
 *      = true. User-Context-Client → RLS-Policy email_message_tenant_update
 *      blockiert Cross-Tenant + tenant_member.
 *   4. Return ok + updatedCount, oder erste UPDATE-Failure als Error.
 *
 * Idempotenz: ein erneutes Set des gleichen Labels ist No-Op fuer den naechs-
 * ten Pipeline-Schritt; pre_filter_corrected bleibt sticky-true.
 *
 * revalidatePath: nach Erfolg, damit die Page bei naechstem Render neue Counts
 * + Label-Badges zeigt.
 */
export async function updateEmailClassifications(
  bulkRunId: string,
  updates: Array<{ message_id: string; new_label: PreFilterLabel }>,
): Promise<UpdateClassificationsResult> {
  const auth = await authorizeReviewer();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }
  if (!Array.isArray(updates)) {
    return { ok: false, error: "updates muss ein Array sein" };
  }
  if (updates.length === 0) {
    return { ok: true, updatedCount: 0 };
  }
  if (updates.length > MAX_UPDATES_PER_CALL) {
    return {
      ok: false,
      error: `Zu viele Updates auf einmal (${updates.length} > ${MAX_UPDATES_PER_CALL})`,
    };
  }
  for (const u of updates) {
    if (!isValidClassificationUpdate(u)) {
      return { ok: false, error: "Ungueltiger Update-Eintrag (Label/UUID)" };
    }
  }

  const supabase = await createClient();
  let updatedCount = 0;

  for (const u of updates) {
    const { error: updateError, count } = await supabase
      .from("email_message")
      .update(
        {
          pre_filter_label: u.new_label,
          pre_filter_corrected: true,
        },
        { count: "exact" },
      )
      .eq("id", u.message_id)
      .eq("bulk_run_id", bulkRunId);
    if (updateError) {
      return {
        ok: false,
        error: `UPDATE fehlgeschlagen fuer ${u.message_id}: ${updateError.message}`,
      };
    }
    updatedCount += count ?? 0;
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/filter-review`);
  return { ok: true, updatedCount };
}

/**
 * Server-Action: GF-Gate-1 Approval — Pre-Filter ist akzeptiert, naechster
 * Pipeline-Schritt (Thread-Aggregation + PII-Redaction) wird enqueued.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. UUID-Validation.
 *   3. User-Context-SELECT bulk_run.status — Pre-Check `'pre_filtered'`
 *      (RLS sorgt fuer Tenant-Iso). Fehler bei Cross-Tenant / nicht existent /
 *      falscher Status.
 *   4. admin-Client INSERT ai_jobs(job_type='email_bulk_thread_redact').
 *      service_role weil ai_jobs ohne tenant-scoped Policy laufen und der
 *      Worker per JOB_TYPES-Loop SKIP-LOCKED-claimed (vgl. uploadBulkEmailRun-
 *      Pattern L261-266).
 *   5. revalidatePath: Page rendert neu, Approval-Button verschwindet.
 */
export async function approvePreFilterAndStartThreadRedact(
  bulkRunId: string,
): Promise<ApprovePreFilterResult> {
  const auth = await authorizeReviewer();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { reviewer } = auth;

  if (!UUID_REGEX.test(bulkRunId)) {
    return { ok: false, error: "Ungueltige bulk_run_id" };
  }

  const supabase = await createClient();
  const { data: runRow, error: runError } = await supabase
    .from("email_bulk_run")
    .select("id, status")
    .eq("id", bulkRunId)
    .maybeSingle();
  if (runError) {
    return { ok: false, error: `Bulk-Run-Lookup fehlgeschlagen: ${runError.message}` };
  }
  if (!runRow) {
    return { ok: false, error: "Bulk-Run nicht gefunden" };
  }
  if (runRow.status !== "pre_filtered") {
    return {
      ok: false,
      error: `Approval nicht moeglich — Status ist '${runRow.status}', erwartet 'pre_filtered'`,
    };
  }

  const admin = createAdminClient();
  const { data: jobRow, error: jobError } = await admin
    .from("ai_jobs")
    .insert({
      tenant_id: reviewer.tenantId,
      job_type: JOB_TYPE_EMAIL_BULK_THREAD_REDACT,
      status: "pending",
      payload: { bulk_run_id: bulkRunId },
    })
    .select("id")
    .single();
  if (jobError || !jobRow) {
    return {
      ok: false,
      error: `Worker-Job-Enqueue fehlgeschlagen: ${jobError?.message ?? "unknown"}`,
    };
  }

  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}/filter-review`);
  revalidatePath(`/dashboard/bulk-email-import/${bulkRunId}`);

  return { ok: true, jobId: jobRow.id as string };
}

/**
 * Re-export der Label-Liste fuer Server-Components (Client-Components
 * importieren direkt aus helpers.ts).
 */
export async function listPreFilterLabels(): Promise<PreFilterLabel[]> {
  return [...PRE_FILTER_LABELS];
}
