"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// V5 Walkthrough-Mode — Capture-Foundation Server Actions.
// SLC-071 MT-4 + MT-5. Deps: walkthrough_session (MIG-031/083), Storage-Bucket
// "walkthroughs" (MIG-031/084), ai_jobs (Migration 031).
//
// Status-Maschine (siehe 083): recording → uploading → uploaded → transcribing
//   → pending_review → approved | rejected | failed.
// Worker-Status-Wechsel (uploaded → transcribing → ...) laufen in SLC-072 via
// service_role und umgehen RLS bewusst.

const WALKTHROUGH_MAX_DURATION_SEC = 1800; // DEC-076: 30min hard cap.
const STORAGE_BUCKET = "walkthroughs";
const RECORDING_OBJECT_NAME = "recording.webm";

// Roles allowed to record a walkthrough. strategaize_admin is bewusst NICHT
// dabei — der dokumentiert nicht, er reviewed.
const RECORDER_ROLES = new Set(["employee", "tenant_member", "tenant_admin"]);

export interface RequestWalkthroughUploadInput {
  captureSessionId: string;
  estimatedDurationSec: number;
}

export interface RequestWalkthroughUploadResult {
  walkthroughSessionId: string;
  uploadUrl: string;
  storagePath: string;
}

export async function requestWalkthroughUpload(
  input: RequestWalkthroughUploadInput
): Promise<RequestWalkthroughUploadResult> {
  // Fast-fail before any DB hit so a bogus client never produces a row.
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

  // Cross-Tenant-Guard. RLS auf capture_session liefert die Zeile gar nicht
  // erst zurueck, wenn sie nicht zum Tenant des Users gehoert; der explizite
  // tenant_id-Vergleich bleibt als Defense-in-Depth-Sicherung.
  const { data: capture, error: captureError } = await supabase
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", input.captureSessionId)
    .single();
  if (captureError || !capture) {
    throw new Error("capture_session nicht gefunden oder fremd-tenant");
  }
  if (capture.tenant_id !== profile.tenant_id) {
    throw new Error("capture_session gehoert nicht zum eigenen Tenant");
  }

  // INSERT laeuft mit dem User-Client → walkthrough_session_insert-Policy
  // verlangt recorded_by_user_id = auth.uid() AND tenant_id = auth.user_tenant_id().
  const { data: created, error: insertError } = await supabase
    .from("walkthrough_session")
    .insert({
      tenant_id: profile.tenant_id,
      capture_session_id: input.captureSessionId,
      recorded_by_user_id: user.id,
      status: "recording",
    })
    .select("id")
    .single();
  if (insertError || !created) {
    throw new Error(
      `walkthrough_session INSERT fehlgeschlagen: ${insertError?.message ?? "unknown"}`
    );
  }

  const walkthroughSessionId = created.id as string;
  const storagePath = `${profile.tenant_id}/${walkthroughSessionId}/${RECORDING_OBJECT_NAME}`;

  // Signed-URL via service-role: anon-key sieht den storage.buckets-Eintrag
  // nicht und createSignedUploadUrl ist ohnehin Admin-API.
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
    walkthroughSessionId,
    uploadUrl: signed.signedUrl,
    storagePath,
  };
}

export interface ConfirmWalkthroughUploadedInput {
  walkthroughSessionId: string;
  durationSec: number;
  fileSizeBytes: number;
}

export async function confirmWalkthroughUploaded(
  input: ConfirmWalkthroughUploadedInput
): Promise<{ ok: true }> {
  // DB-CHECK fangs ohnehin ab; Fast-Fail spart einen Roundtrip.
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
