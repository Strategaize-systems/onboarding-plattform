import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";
import { verifyServiceKey } from "@/lib/auth/service-key";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

/**
 * POST /api/dialogue/recording-ready
 *
 * Webhook called by Jibri finalize script after recording completes.
 * Authenticates via RECORDING_WEBHOOK_SECRET bearer token.
 *
 * Input: { room_name: string, file_path: string }
 * Action:
 *   1. Find dialogue_session by jitsi_room_name
 *   2. Read MP4 from Jibri volume path
 *   3. Upload to Supabase Storage (recordings/{tenant_id}/{dialogue_id}/recording.mp4)
 *   4. Update dialogue_session with storage path
 *   5. Enqueue dialogue_transcription job
 */
export async function POST(request: Request) {
  // Authenticate via shared secret
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.RECORDING_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("[recording-ready] RECORDING_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  // SLC-195 MT-4 (ISSUE-123): timing-safe Bearer-Vergleich statt `!==`
  // (Timing-Oracle-Defense-in-Depth). verifyServiceKey macht Length-Check +
  // crypto.timingSafeEqual; expectedSecret ist hier garantiert gesetzt (500 oben).
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!verifyServiceKey(bearer, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { room_name: string; file_path: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.room_name || !body.file_path) {
    return NextResponse.json(
      { error: "room_name and file_path are required" },
      { status: 400 }
    );
  }

  // SLC-195 MT-4 (ISSUE-123): Path-Traversal-Guard. body.file_path ist
  // Webhook-kontrolliert → nur Pfade INNERHALB des konfigurierten Jibri-
  // Recording-Verzeichnisses, keine `..`-Traversal, nur `.mp4`. Fail-closed:
  // ohne JIBRI_RECORDINGS_DIR wird jeder Pfad abgewiesen (die Route ist heute
  // middleware-unerreichbar; die ENV ist Pflicht VOR jeder Re-Aktivierung).
  const recordingsBase = process.env.JIBRI_RECORDINGS_DIR;
  const resolvedPath = resolve(body.file_path);
  const baseResolved = recordingsBase ? resolve(recordingsBase) : null;
  const withinBase =
    baseResolved !== null &&
    (resolvedPath === baseResolved ||
      resolvedPath.startsWith(baseResolved + sep));
  if (
    body.file_path.includes("..") ||
    !resolvedPath.endsWith(".mp4") ||
    !withinBase
  ) {
    console.error(`[recording-ready] rejected file_path: ${body.file_path}`);
    return NextResponse.json({ error: "Invalid file_path" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Find dialogue session by room name
  const { data: session, error: sessionError } = await admin
    .from("dialogue_session")
    .select("id, tenant_id, status, capture_session_id")
    .eq("jitsi_room_name", body.room_name)
    .single();

  if (sessionError || !session) {
    console.error(
      `[recording-ready] Session not found for room: ${body.room_name}`,
      sessionError
    );
    return NextResponse.json(
      { error: "Dialogue session not found" },
      { status: 404 }
    );
  }

  // 2. Read MP4 file from Jibri volume
  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(resolvedPath);
  } catch (err) {
    console.error(
      `[recording-ready] Failed to read file: ${body.file_path}`,
      err
    );
    return NextResponse.json(
      { error: "Failed to read recording file" },
      { status: 500 }
    );
  }

  // 3. Upload to Supabase Storage
  const storagePath = `${session.tenant_id}/${session.id}/recording.mp4`;

  const { error: uploadError } = await admin.storage
    .from("recordings")
    .upload(storagePath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    console.error("[recording-ready] Storage upload failed:", uploadError);
    return NextResponse.json(
      { error: "Storage upload failed" },
      { status: 500 }
    );
  }

  // 4. Update dialogue_session with storage path + status
  const { error: updateError } = await admin
    .from("dialogue_session")
    .update({
      recording_storage_path: storagePath,
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (updateError) {
    console.error("[recording-ready] Failed to update session:", updateError);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }

  // 5. V9.75 Tier-Gate (Schicht 1) — dialogue_transcription verlangt >= handbook.
  // dialogue_session.capture_session_id ist NOT NULL (Migration 059).
  const gate = await assertSessionTierAllows(
    admin,
    session.capture_session_id,
    "dialogue_transcription"
  );
  if (!gate.allowed) {
    console.error(
      `[recording-ready] tier_gate_denied: dialogue_transcription for session ${session.id}`
    );
    return NextResponse.json({ error: "tier_gate_denied" }, { status: 403 });
  }

  // 6. Enqueue dialogue_transcription job (mit session_tier-Stempel)
  const { error: jobError } = await admin.from("ai_jobs").insert({
    tenant_id: session.tenant_id,
    job_type: "dialogue_transcription",
    payload: {
      dialogue_session_id: session.id,
      recording_storage_path: storagePath,
    },
    status: "pending",
    session_tier: gate.tier,
  });

  if (jobError) {
    // Non-fatal: recording is saved, transcription can be re-triggered
    console.error("[recording-ready] Failed to enqueue job:", jobError);
  }

  console.log(
    `[recording-ready] Recording processed: session=${session.id}, path=${storagePath}`
  );

  return NextResponse.json({
    success: true,
    dialogue_session_id: session.id,
    storage_path: storagePath,
  });
}
