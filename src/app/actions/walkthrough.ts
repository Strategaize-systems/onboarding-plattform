"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// V5 Walkthrough-Mode — Capture-Foundation Server Actions.
// SLC-071 MT-4 + MT-5 (initial). SLC-075 MT-1 (Self-Spawn-Refactor).
// Deps: walkthrough_session (MIG-031/083), Storage-Bucket "walkthroughs"
// (MIG-031/084), ai_jobs (Migration 031), capture_session (MIG-001/021).
//
// SLC-075 Self-Spawn-Pattern (DEC-080):
//   startWalkthroughSession() erzeugt capture_session + walkthrough_session
//   atomar via service_role. Mitarbeiter (employee) kann selbst KEIN
//   capture_session INSERTen (nur tenant_admin/strategaize_admin per
//   capture_session_tenant_admin_write Policy). Daher Service-Role-Bypass —
//   Pattern analog V4 FEAT-023 Bridge-RPC.
//
//   requestWalkthroughUpload(walkthroughSessionId) bekommt jetzt die fertige
//   walkthrough_session-ID (von startWalkthroughSession), prueft
//   recorded_by_user_id = auth.uid() via RLS und liefert nur die signed URL.
//   Status bleibt 'recording' bis confirmWalkthroughUploaded ihn auf
//   'uploaded' setzt.
//
// Status-Maschine (siehe 083): recording → uploading → uploaded → transcribing
//   → pending_review → approved | rejected | failed.
// Worker-Status-Wechsel (uploaded → transcribing → ...) laufen in SLC-072 via
// service_role und umgehen RLS bewusst.

const WALKTHROUGH_MAX_DURATION_SEC = 1800; // DEC-076: 30min hard cap.
const STORAGE_BUCKET = "walkthroughs";
const RECORDING_OBJECT_NAME = "recording.webm";

/**
 * Self-hosted Supabase via Coolify exposes Kong on the internal Docker network
 * as `http://supabase-kong:8000` (`SUPABASE_URL`) and externally via the app
 * domain at `NEXT_PUBLIC_SUPABASE_URL`. `createSignedUploadUrl` builds the URL
 * relative to the client base URL — when the admin client uses the internal
 * hostname, the returned `signedUrl` is unreachable from a browser
 * (`xhr.onerror` "Netzwerkfehler"). Rewrite the host before returning to the
 * client so the browser hits the public reverse-proxy path.
 *
 * The Coolify-Kong gateway additionally rejects requests that arrive without an
 * `apikey` (HTTP 401 `{"message":"No API key found in request"}`, verwandt mit
 * ISSUE-025). Append the public anon-key as a query parameter — it is already
 * exposed to the browser via `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the actual
 * write authorization is enforced by the signed-URL token + storage RLS.
 */
function rewriteSignedUrlForBrowser(url: string): string {
  const internalBase = process.env.SUPABASE_URL;
  const externalBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!internalBase || !externalBase) return url;

  let rewritten = url;
  if (internalBase !== externalBase && url.startsWith(internalBase)) {
    rewritten = externalBase + url.slice(internalBase.length);
  }

  if (anonKey && !/[?&]apikey=/.test(rewritten)) {
    const separator = rewritten.includes("?") ? "&" : "?";
    rewritten = `${rewritten}${separator}apikey=${encodeURIComponent(anonKey)}`;
  }

  return rewritten;
}

// Roles allowed to record a walkthrough. strategaize_admin is bewusst NICHT
// dabei — der dokumentiert nicht, er reviewed.
const RECORDER_ROLES = new Set(["employee", "tenant_member", "tenant_admin"]);

// =============================================================================
// startWalkthroughSession — SLC-075 MT-1 Self-Spawn-Action (DEC-080)
// =============================================================================

export interface StartWalkthroughSessionResult {
  walkthroughSessionId: string;
  captureSessionId: string;
}

/**
 * Spawns a fresh capture_session (capture_mode='walkthrough') and the matching
 * walkthrough_session (status='recording') for the calling user. Service-role
 * is required because RLS on capture_session blocks INSERT for employee /
 * tenant_member roles (Migration 022 capture_session_tenant_admin_write).
 *
 * Returns the new walkthrough_session id which the caller passes to
 * requestWalkthroughUpload + confirmWalkthroughUploaded later.
 *
 * Template resolution: picks the oldest template system-wide (templates are
 * not tenant-scoped per Migration 021). For onboarding workloads with a single
 * canonical template this is the right pick; multi-template tenants will have
 * to revisit this when they exist.
 */
export async function startWalkthroughSession(): Promise<StartWalkthroughSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    throw new Error("Profil nicht gefunden");
  }
  if (!profile.tenant_id || !RECORDER_ROLES.has(profile.role)) {
    throw new Error(
      "Nicht berechtigt — nur Mitarbeiter, Tenant-Member oder Tenant-Admin koennen Walkthroughs aufnehmen"
    );
  }

  const admin = createAdminClient();

  // Pick the oldest template — onboarding has typically one canonical template
  // (exit_readiness). If multiple templates exist, the oldest is the V1 entry.
  const { data: template, error: templateError } = await admin
    .from("template")
    .select("id, version")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (templateError || !template) {
    throw new Error(
      `Kein Template fuer Walkthrough-Capture gefunden: ${templateError?.message ?? "no rows"}`
    );
  }

  // Insert capture_session via service_role (RLS would block employee).
  const { data: capture, error: captureError } = await admin
    .from("capture_session")
    .insert({
      tenant_id: profile.tenant_id,
      template_id: template.id,
      template_version: template.version,
      owner_user_id: user.id,
      status: "open",
      capture_mode: "walkthrough",
    })
    .select("id")
    .single();
  if (captureError || !capture) {
    throw new Error(
      `capture_session INSERT fehlgeschlagen: ${captureError?.message ?? "unknown"}`
    );
  }

  const captureSessionId = capture.id as string;

  // Insert walkthrough_session via service_role to keep both inserts on the
  // same connection. If this fails the capture_session is rolled back to keep
  // the data model clean — orphan capture_sessions would confuse the cleanup
  // cron in SLC-074.
  const { data: walk, error: walkError } = await admin
    .from("walkthrough_session")
    .insert({
      tenant_id: profile.tenant_id,
      capture_session_id: captureSessionId,
      recorded_by_user_id: user.id,
      status: "recording",
    })
    .select("id")
    .single();
  if (walkError || !walk) {
    await admin.from("capture_session").delete().eq("id", captureSessionId);
    throw new Error(
      `walkthrough_session INSERT fehlgeschlagen: ${walkError?.message ?? "unknown"}`
    );
  }

  return {
    walkthroughSessionId: walk.id as string,
    captureSessionId,
  };
}

// =============================================================================
// requestWalkthroughUpload — SLC-075 MT-1 Refactor (was SLC-071 MT-4)
// =============================================================================

export interface RequestWalkthroughUploadInput {
  walkthroughSessionId: string;
  estimatedDurationSec: number;
}

export interface RequestWalkthroughUploadResult {
  walkthroughSessionId: string;
  uploadUrl: string;
  storagePath: string;
}

/**
 * Issues a signed Supabase Storage URL for the existing walkthrough_session.
 * Pre-condition: the row was created by startWalkthroughSession and is still
 * in status 'recording'. RLS on walkthrough_session restricts the user-client
 * lookup to recorded_by_user_id = auth.uid() — owners only.
 */
export async function requestWalkthroughUpload(
  input: RequestWalkthroughUploadInput
): Promise<RequestWalkthroughUploadResult> {
  if (
    !Number.isFinite(input.estimatedDurationSec) ||
    input.estimatedDurationSec <= 0 ||
    input.estimatedDurationSec > WALKTHROUGH_MAX_DURATION_SEC
  ) {
    throw new Error(
      `estimatedDurationSec ${input.estimatedDurationSec} ueberschreitet das 1800s Limit (30min)`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  // RLS on walkthrough_session lets the recorder see only own rows; a
  // mismatched recorder gets data:null without error.
  const { data: session, error: sessionError } = await supabase
    .from("walkthrough_session")
    .select("id, tenant_id, recorded_by_user_id, status")
    .eq("id", input.walkthroughSessionId)
    .maybeSingle();
  if (sessionError || !session) {
    throw new Error("walkthrough_session nicht gefunden oder nicht zugaenglich");
  }
  if (session.recorded_by_user_id !== user.id) {
    throw new Error(
      "Nur der Aufnehmer (recorded_by_user_id) darf Upload anfordern"
    );
  }
  if (session.status !== "recording") {
    throw new Error(
      `Ungueltiger status '${session.status}' fuer requestWalkthroughUpload — erlaubt ist nur 'recording'`
    );
  }

  const storagePath = `${session.tenant_id}/${session.id}/${RECORDING_OBJECT_NAME}`;

  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (signedError || !signed?.signedUrl) {
    throw new Error(
      `Signed Upload URL Erzeugung fehlgeschlagen: ${signedError?.message ?? "unknown"}`
    );
  }

  return {
    walkthroughSessionId: session.id,
    uploadUrl: rewriteSignedUrlForBrowser(signed.signedUrl),
    storagePath,
  };
}

// =============================================================================
// confirmWalkthroughUploaded — unchanged from SLC-071 MT-5
// =============================================================================

export interface ConfirmWalkthroughUploadedInput {
  walkthroughSessionId: string;
  durationSec: number;
  fileSizeBytes: number;
}

export async function confirmWalkthroughUploaded(
  input: ConfirmWalkthroughUploadedInput
): Promise<{ ok: true }> {
  if (
    !Number.isFinite(input.durationSec) ||
    input.durationSec <= 0 ||
    input.durationSec > WALKTHROUGH_MAX_DURATION_SEC
  ) {
    throw new Error(
      `durationSec ${input.durationSec} ueberschreitet das 1800s Limit (30min)`
    );
  }
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error(`fileSizeBytes ${input.fileSizeBytes} ungueltig`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht authentifiziert");

  // Self-Confirm-Only: nur der Aufnehmer darf bestaetigen. Wir lesen die
  // Zeile mit dem User-Client; RLS zeigt sie nur, wenn er sie sehen darf.
  const { data: session, error: loadError } = await supabase
    .from("walkthrough_session")
    .select("id, tenant_id, recorded_by_user_id, status")
    .eq("id", input.walkthroughSessionId)
    .single();
  if (loadError || !session) {
    throw new Error("walkthrough_session nicht gefunden");
  }
  if (session.recorded_by_user_id !== user.id) {
    throw new Error(
      "Nur der Aufnehmer (recorded_by_user_id) darf den Upload bestaetigen (Self-Confirm-Only)"
    );
  }
  if (session.status !== "recording" && session.status !== "uploading") {
    throw new Error(
      `Ungueltiger status '${session.status}' fuer confirmWalkthroughUploaded — erlaubt sind nur 'recording' oder 'uploading'`
    );
  }

  const storagePath = `${session.tenant_id}/${session.id}/${RECORDING_OBJECT_NAME}`;
  const admin = createAdminClient();

  // UPDATE laeuft via service_role (BYPASSRLS). walkthrough_session_update_review
  // erlaubt nur Admin-Reviews; Worker- und Confirm-Transitions umgehen RLS bewusst.
  const { error: updateError } = await admin
    .from("walkthrough_session")
    .update({
      storage_path: storagePath,
      duration_sec: input.durationSec,
      file_size_bytes: input.fileSizeBytes,
      status: "uploaded",
    })
    .eq("id", session.id);
  if (updateError) {
    throw new Error(
      `walkthrough_session UPDATE fehlgeschlagen: ${updateError.message}`
    );
  }

  // ai_jobs INSERT — Worker-Pickup laeuft in SLC-072.
  const { error: jobError } = await admin.from("ai_jobs").insert({
    tenant_id: session.tenant_id,
    job_type: "walkthrough_transcribe",
    status: "pending",
    payload: { walkthroughSessionId: session.id },
  });
  if (jobError) {
    throw new Error(`ai_jobs INSERT fehlgeschlagen: ${jobError.message}`);
  }

  revalidatePath(`/employee/walkthroughs/${session.id}`);

  return { ok: true };
}
