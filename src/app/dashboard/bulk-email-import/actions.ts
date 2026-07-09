"use server";

// V9 SLC-165 MT-4 — Bulk-Email-Upload Server-Action.
//
// Drei Aktionen:
//   - uploadBulkEmailRun(formData): pro-File-Upload + capture_session-Hook +
//     Storage-PUT + email_bulk_run INSERT + ai_jobs(email_bulk_parse).
//   - listBulkRunsForTenant(): Status-Liste fuer Upload-Page.
//   - getBulkRunById(): Detail-Lookup (fuer SLC-165 MT-6 Detail-View).
//
// Auth-Gate: tenant_admin (GF). strategaize_admin nicht erlaubt zu uploaden —
// nur SELECT Cross-Tenant per RLS-Policy. employee kein Zugriff.
//
// Pattern-Reuse (per .claude/rules/strategaize-pattern-reuse.md):
//   - capture_session-Hook + service_role bypass: walkthrough-Pattern
//     (src/app/actions/walkthrough.ts:startWalkthroughSession, DEC-080 self-spawn).
//   - File-Hash + Duplicate-Check: src/lib/bulk-email/file-hash.ts (SLC-165 MT-3).
//   - Storage-PUT + Rollback-on-Insert-Fail: evidence-upload-Route
//     (src/app/api/capture/[sessionId]/evidence/upload/route.ts).
//   - ai_jobs INSERT + Rollback-on-Job-Fail: diagnose-actions
//     (src/app/dashboard/diagnose/actions.ts:submitDiagnoseRun).
//
// Stream-Mode: Komplett-Buffer bis 500 MB Soft-Cap (DEC-MT-4-A, vom User
// bestaetigt 2026-06-02). Bucket hard-capt auf 524288000 = 500 MB
// (sql/migrations/106 Zeile 475). MT-5 Worker macht das echte Streaming.
//
// Capture-Mode-Hook: MT-4 sofort (DEC-MT-4-B, vom User bestaetigt 2026-06-02).
// Picks oldest template system-wide analog walkthrough-Self-Spawn; bei fehlendem
// Template laeuft der Upload trotzdem (capture_session_id bleibt NULL).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";
import { computeFileHash } from "@/lib/bulk-email/file-hash";
import {
  STORAGE_BUCKET,
  JOB_TYPE_EMAIL_BULK_PARSE,
  CAPTURE_MODE_EMAIL_BULK,
  validateUploadFile,
  safeStorageBasename,
  type BulkRunSummary,
  type UploadResult,
} from "./helpers";

interface AuthorizedUploader {
  userId: string;
  tenantId: string;
}

/**
 * Auth-Gate: nur eingeloggter tenant_admin (GF) darf uploaden. strategaize_admin
 * bewusst NICHT — V9.0 RLS-Matrix erlaubt nur tenant_admin INSERT (siehe
 * sql/migrations/106 Zeile 285-301). Cross-Tenant-Admin sieht nur Audit.
 */
async function authorizeBulkEmailUploader(): Promise<
  { uploader: AuthorizedUploader } | { error: string }
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
      error: "Nur Tenant-Admins koennen Bulk-Email-Importe starten",
    };
  }
  if (!profile.tenant_id) {
    return { error: "Kein Tenant zugeordnet" };
  }

  return {
    uploader: {
      userId: user.id,
      tenantId: profile.tenant_id as string,
    },
  };
}

/**
 * Pick oldest template system-wide. capture_session.template_id ist NOT NULL,
 * also brauchen wir irgendeine gueltige Referenz. Walkthrough-Pattern picks
 * oldest, wir folgen dem. Wenn KEIN Template existiert (Fresh-DB, sehr seltener
 * Edge-Case), geben wir null zurueck — bulk_run wird dann ohne capture_session-
 * Hook angelegt.
 */
async function pickFallbackTemplate(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ id: string; version: string } | null> {
  const { data, error } = await admin
    .from("template")
    .select("id, version")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return { id: data.id as string, version: data.version as string };
}

/**
 * Erzeugt eine capture_session mit capture_mode='email_bulk'. Bei fehlendem
 * Template wird kein capture_session angelegt und null zurueckgegeben — der
 * bulk_run laeuft dann ohne Hook (capture_session_id bleibt NULL).
 */
async function createCaptureSessionHook(
  admin: ReturnType<typeof createAdminClient>,
  uploader: AuthorizedUploader,
): Promise<string | null> {
  const template = await pickFallbackTemplate(admin);
  if (!template) {
    return null;
  }

  const { data, error } = await admin
    .from("capture_session")
    .insert({
      tenant_id: uploader.tenantId,
      template_id: template.id,
      template_version: template.version,
      owner_user_id: uploader.userId,
      status: "in_progress",
      capture_mode: CAPTURE_MODE_EMAIL_BULK,
      // V20 SLC-193 MT-2 (DEC-279): seit MIG-133 der Column-DEFAULT auf 'free' sinkt,
      // muss der entitled tier explizit gesetzt werden. Bulk-E-Mail ist ein handbook-
      // Feature (email_bulk_* = handbook) und wird direkt danach synchron gegated —
      // ohne 'handbook' wuerde der Run sofort rollen. service_role-INSERT -> kein Coerce.
      tier: "handbook",
      answers: {},
    })
    .select("id")
    .single();
  if (error || !data) {
    return null;
  }
  return data.id as string;
}

/**
 * Server-Action: Bulk-Email-Datei (.mbox oder .eml) hochladen.
 *
 * Flow:
 *   1. Auth-Gate (tenant_admin).
 *   2. File-Validation (Extension/MIME/Groesse).
 *   3. File-Hash via lib/bulk-email/file-hash.
 *   4. Duplicate-Check via SELECT (tenant_id, file_hash) — UNIQUE-Constraint
 *      backstop, wir pruefen aktiv vorher um sauberes Result statt 23505-Error.
 *   5. Capture-Session-Hook (capture_mode='email_bulk').
 *   6. Storage-PUT in `bulk-email`-Bucket, Pfad `{tenant_id}/{file_hash}/{name}`.
 *   7. email_bulk_run INSERT mit status='uploaded'.
 *   8. ai_jobs INSERT mit job_type='email_bulk_parse', payload.bulk_run_id.
 *   9. Rollback-Kaskade: Storage-Object loeschen + capture_session loeschen,
 *      wenn email_bulk_run oder ai_jobs INSERT fehlschlaegt.
 */
export async function uploadBulkEmailRun(
  formData: FormData,
): Promise<UploadResult> {
  const auth = await authorizeBulkEmailUploader();
  if ("error" in auth) {
    return { ok: false, error: auth.error };
  }
  const { uploader } = auth;

  const fileEntry = formData.get("file");
  if (!fileEntry || !(fileEntry instanceof File)) {
    return { ok: false, error: "Feld 'file' fehlt oder ist keine Datei" };
  }
  const file = fileEntry;

  const validationError = validateUploadFile(file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  // Buffer laden (DEC-MT-4-A: Komplett bis 500 MB).
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: `Datei-Read fehlgeschlagen: ${(err as Error).message}`,
    };
  }

  const fileHash = computeFileHash(buffer);
  const admin = createAdminClient();

  // Duplicate-Check: bewusste Pre-Check vor Storage-PUT damit wir bei Re-Upload
  // kein neues Object hochladen. UNIQUE(tenant_id, file_hash) ist Backstop.
  const { data: existingRun, error: dupError } = await admin
    .from("email_bulk_run")
    .select("id")
    .eq("tenant_id", uploader.tenantId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (dupError) {
    return {
      ok: false,
      error: `Duplicate-Check fehlgeschlagen: ${dupError.message}`,
    };
  }
  if (existingRun?.id) {
    return { ok: true, runId: existingRun.id as string, duplicate: true };
  }

  const captureSessionId = await createCaptureSessionHook(admin, uploader);

  const safeName = safeStorageBasename(file.name);
  const storagePath = `${uploader.tenantId}/${fileHash}/${safeName}`;

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    if (captureSessionId) {
      await admin.from("capture_session").delete().eq("id", captureSessionId);
    }
    return {
      ok: false,
      error: `Storage-Upload fehlgeschlagen: ${uploadError.message}`,
    };
  }

  const { data: bulkRun, error: insertError } = await admin
    .from("email_bulk_run")
    .insert({
      tenant_id: uploader.tenantId,
      uploader_user_id: uploader.userId,
      capture_session_id: captureSessionId,
      source_file_name: file.name,
      file_hash: fileHash,
      storage_path: storagePath,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (insertError || !bulkRun) {
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (captureSessionId) {
      await admin.from("capture_session").delete().eq("id", captureSessionId);
    }
    return {
      ok: false,
      error: `email_bulk_run INSERT fehlgeschlagen: ${insertError?.message ?? "unknown"}`,
    };
  }

  const bulkRunId = bulkRun.id as string;

  // V9.75 Tier-Gate (Schicht 1) — email_bulk_* verlangt >= handbook. Nur wenn der
  // Run an eine capture_session gebunden ist (session-loser Forward-Bucket-Pfad
  // ist nicht per-Session-gegated, DEC: ARCHITECTURE §4 + MT-3). Bei Verstoss:
  // Rollback analog zum Job-Enqueue-Fehlerpfad (Run + Storage + Session loeschen).
  let sessionTier: string | null = null;
  if (captureSessionId) {
    const gate = await assertSessionTierAllows(
      admin,
      captureSessionId,
      JOB_TYPE_EMAIL_BULK_PARSE
    );
    if (!gate.allowed) {
      await admin.from("email_bulk_run").delete().eq("id", bulkRunId);
      await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
      await admin.from("capture_session").delete().eq("id", captureSessionId);
      return {
        ok: false,
        error:
          "Bulk-E-Mail-Import ist fuer die aktuelle Stufe nicht freigeschaltet (tier_gate_denied)",
      };
    }
    sessionTier = gate.tier;
  }

  const { error: jobError } = await admin.from("ai_jobs").insert({
    tenant_id: uploader.tenantId,
    job_type: JOB_TYPE_EMAIL_BULK_PARSE,
    status: "pending",
    payload: { bulk_run_id: bulkRunId },
    session_tier: sessionTier,
  });
  if (jobError) {
    await admin.from("email_bulk_run").delete().eq("id", bulkRunId);
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (captureSessionId) {
      await admin.from("capture_session").delete().eq("id", captureSessionId);
    }
    return {
      ok: false,
      error: `Worker-Job-Enqueue fehlgeschlagen: ${jobError.message}`,
    };
  }

  return { ok: true, runId: bulkRunId, duplicate: false };
}

/**
 * Status-Liste fuer Upload-Page. Liefert alle Bulk-Runs des aktuellen Tenants,
 * neueste zuerst. Nutzt user-context Client damit RLS greift (tenant_admin
 * sieht eigene, strategaize_admin sieht alle — beide ueber dieselbe Route).
 */
export async function listBulkRunsForTenant(): Promise<BulkRunSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("email_bulk_run")
    .select(
      "id, source_file_name, email_count, content_emails, thread_count, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur, status, failure_reason, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];

  return data as unknown as BulkRunSummary[];
}

/**
 * Detail-Lookup fuer SLC-165 MT-6 Detail-View. Hier nur als Pre-Declaration
 * exportiert; MT-6 baut die UI dazu. Liefert null bei nicht gefundenem Run
 * oder fehlendem RLS-Match.
 */
export async function getBulkRunById(
  runId: string,
): Promise<BulkRunSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("email_bulk_run")
    .select(
      "id, source_file_name, email_count, content_emails, thread_count, patterns_extracted, patterns_accepted, patterns_imported, pre_filter_cost_eur, pattern_extraction_cost_eur, total_cost_eur, status, failure_reason, created_at, updated_at, completed_at",
    )
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as BulkRunSummary;
}

export interface ThreadStatusBreakdown {
  aggregated: number;
  redacting: number;
  redacted: number;
  failed: number;
  total: number;
}

/**
 * V9 SLC-166 MT-7 — Live-Aggregat fuer Thread-Redact-Progress in der Detail-View.
 *
 * Liefert per-status-Counts ueber email_thread filtered auf bulk_run_id. Nutzt
 * user-context Client: RLS-Policy gilt analog Detail-View (tenant_admin own,
 * strategaize_admin cross-tenant). Bei Fehler ODER fehlendem RLS-Match liefert
 * die Funktion null — die Detail-View rendert dann ohne Aggregat-Card.
 *
 * Pattern-Reuse: getBulkRunById oben (user-context + maybeSingle-Pattern).
 */
export async function getThreadStatusBreakdown(
  runId: string,
): Promise<ThreadStatusBreakdown | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("email_thread")
    .select("thread_status")
    .eq("bulk_run_id", runId);
  if (error || !data) return null;

  const breakdown: ThreadStatusBreakdown = {
    aggregated: 0,
    redacting: 0,
    redacted: 0,
    failed: 0,
    total: 0,
  };
  for (const row of data as Array<{ thread_status: string }>) {
    const s = row.thread_status;
    if (s === "aggregated" || s === "redacting" || s === "redacted" || s === "failed") {
      breakdown[s] += 1;
      breakdown.total += 1;
    }
  }
  return breakdown;
}
