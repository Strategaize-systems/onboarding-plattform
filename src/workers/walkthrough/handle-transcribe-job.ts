// Worker Handler: walkthrough_transcribe
// SLC-072 — V5 Walkthrough-Mode (FEAT-035, DEC-018 Whisper-Adapter Reuse)
//
// Picks ai_jobs entries with job_type='walkthrough_transcribe', loads the
// walkthrough_session, downloads the WebM recording from Storage, extracts
// audio via ffmpeg, transcribes via the self-hosted Whisper provider and
// persists the transcript as a knowledge_unit row.
//
// Status-Maschine (Migration 083):
//   uploaded → transcribing → pending_review (Erfolg)
//   uploaded → transcribing → failed         (Fehler in Download/ffmpeg/Whisper/Insert)
//   != uploaded               → no-op (Skip mit Warning, kein Throw)
//
// Cleanup:
//   /tmp/<id>.webm wird nach jedem Pfad (success+failure) entfernt.
//   extractAudioBuffer kapselt eigenes /tmp-Cleanup fuer das WAV.
//
// V5 Option 2 Pipeline-Trigger (SLC-076 MT-5, deployed):
//   Am Ende des Erfolgspfads ruft advanceWalkthroughPipeline(sessionId).
//   Es setzt status 'transcribing' → 'redacting' und erzeugt einen ai_jobs-Eintrag
//   fuer walkthrough_redact_pii. Status 'pending_review' wird erst nach Stufe 3
//   (Auto-Mapping, SLC-078) erreicht.

import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAdminClient } from "../../lib/supabase/admin";
import { getWhisperProvider } from "../../lib/ai/whisper/factory";
import { extractAudioBuffer } from "../dialogue/audio-extract";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";
import { advanceWalkthroughPipeline } from "../../lib/walkthrough/pipeline-trigger";
import type { ClaimedJob } from "../condensation/claim-loop";

interface WalkthroughTranscribePayload {
  walkthroughSessionId: string;
}

interface WalkthroughSessionRow {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  recorded_by_user_id: string;
  storage_path: string | null;
  storage_bucket: string;
  status: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const WHISPER_MODEL = "whisper-medium";
const LOG_SOURCE = "walkthrough_transcription";

export async function handleWalkthroughTranscribeJob(
  job: ClaimedJob
): Promise<void> {
  const adminClient = createAdminClient();
  const startMs = Date.now();

  const payload = job.payload as unknown as WalkthroughTranscribePayload;
  if (!payload || !isUuid(payload.walkthroughSessionId)) {
    throw new Error(
      "walkthrough_transcribe: payload.walkthroughSessionId missing or not a UUID"
    );
  }
  const sessionId = payload.walkthroughSessionId;

  // 1. Load walkthrough_session via service_role (bypass RLS — system path).
  const { data: sessionRow, error: loadError } = await adminClient
    .from("walkthrough_session")
    .select(
      "id, tenant_id, capture_session_id, recorded_by_user_id, storage_path, storage_bucket, status"
    )
    .eq("id", sessionId)
    .single();
  if (loadError || !sessionRow) {
    throw new Error(
      `walkthrough_transcribe: walkthrough_session ${sessionId} not found: ${
        loadError?.message ?? "no row"
      }`
    );
  }
  const session = sessionRow as WalkthroughSessionRow;

  // 2. Status-Skip fuer alles ausser 'uploaded' (idempotent, kein Throw).
  if (session.status !== "uploaded") {
    captureWarning(
      `walkthrough_transcribe: skipping session ${sessionId} with status='${session.status}' (expected 'uploaded')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, walkthroughSessionId: sessionId, status: session.status },
      }
    );
    // Mark ai_job complete — there is nothing to do, we don't want a retry loop.
    await adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id });
    return;
  }

  if (!session.storage_path) {
    throw new Error(
      `walkthrough_transcribe: walkthrough_session ${sessionId} hat keinen storage_path`
    );
  }

  // 3. Status='transcribing' + transcript_started_at.
  const { error: startError } = await adminClient
    .from("walkthrough_session")
    .update({
      status: "transcribing",
      transcript_started_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (startError) {
    throw new Error(
      `walkthrough_transcribe: status='transcribing' UPDATE failed: ${startError.message}`
    );
  }

  // tmp-Datei fuer Audit-Trail bei R1 (Speicher-Spikes). extractAudioBuffer
  // arbeitet rein im Buffer; das webmPath-File ist optional, wird aber im
  // finally aufgeraeumt.
  const webmPath = join(tmpdir(), `walkthrough-${sessionId}.webm`);
  let webmFileWritten = false;

  try {
    // 4. Download recording from Storage via service_role.
    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from(session.storage_bucket)
      .download(session.storage_path);
    if (downloadError || !fileBlob) {
      throw new Error(
        `walkthrough_transcribe: storage download failed for ${session.storage_path}: ${
          downloadError?.message ?? "no data"
        }`
      );
    }
    const webmBuffer = Buffer.from(await fileBlob.arrayBuffer());
    await writeFile(webmPath, webmBuffer);
    webmFileWritten = true;

    // 5. ffmpeg audio extraction (WebM container → 16kHz mono WAV).
    // extractAudioBuffer is container-agnostic; ffmpeg detects WebM via magic
    // bytes regardless of the temp filename used internally.
    const { wavBuffer, durationSeconds } = await extractAudioBuffer(webmBuffer);

    // 6. Whisper transcription via configured provider (DEC-018 reuse).
    const whisper = getWhisperProvider();
    const transcriptionResult = await whisper.transcribe(wavBuffer, {
      language: "de",
      filename: `walkthrough-${sessionId}.wav`,
    });
    const transcriptText = (transcriptionResult.text ?? "").trim();
    if (!transcriptText) {
      throw new Error(
        "walkthrough_transcribe: whisper returned empty transcript"
      );
    }

    // 7. Insert knowledge_unit. tenant_id is taken from the session row — no
    // tenant switch is possible (R5 mitigation). block_key='unassigned' matches
    // the dialogue-extraction pattern (DEC-040 free-text KU). The recorder is
    // tracked via evidence_refs (mirrors walkthrough_session.recorded_by_user_id)
    // and updated_by; the schema has no separate created_by_user_id column.
    const titleSource = transcriptText.replace(/\s+/g, " ").trim();
    const title =
      titleSource.length > 80
        ? `${titleSource.slice(0, 77).trimEnd()}...`
        : titleSource || "Walkthrough-Transkript";
    const { data: kuRow, error: kuError } = await adminClient
      .from("knowledge_unit")
      .insert({
        tenant_id: session.tenant_id,
        capture_session_id: session.capture_session_id,
        block_checkpoint_id: null,
        block_key: "unassigned",
        source: "walkthrough_transcript",
        unit_type: "observation",
        confidence: "medium",
        title,
        body: transcriptText,
        evidence_refs: {
          walkthrough_session_id: session.id,
          recorded_by_user_id: session.recorded_by_user_id,
        },
        updated_by: session.recorded_by_user_id,
      })
      .select("id")
      .single();
    if (kuError || !kuRow) {
      throw new Error(
        `walkthrough_transcribe: knowledge_unit INSERT failed: ${
          kuError?.message ?? "no row"
        }`
      );
    }

    // 8a. Persist transcript metadata. Status-Wechsel uebernimmt der Pipeline-Trigger (Schritt 8b).
    const { error: metaError } = await adminClient
      .from("walkthrough_session")
      .update({
        transcript_completed_at: new Date().toISOString(),
        transcript_model: WHISPER_MODEL,
        transcript_knowledge_unit_id: kuRow.id,
      })
      .eq("id", sessionId);
    if (metaError) {
      throw new Error(
        `walkthrough_transcribe: transcript metadata UPDATE failed: ${metaError.message}`
      );
    }

    // 8b. Pipeline-Trigger (V5 Option 2 SLC-076 MT-5):
    //     transcribing → redacting + enqueue walkthrough_redact_pii.
    const advance = await advanceWalkthroughPipeline(adminClient, sessionId);

    // 9. Mark ai_job complete.
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id }
    );
    if (completeError) {
      throw new Error(
        `walkthrough_transcribe: rpc_complete_ai_job failed: ${completeError.message}`
      );
    }

    captureInfo(
      `walkthrough_transcribe: session=${sessionId} done in ${
        Date.now() - startMs
      }ms (transcript=${transcriptText.length} chars, audio≈${durationSeconds}s, status ${
        advance.fromStatus
      } → ${advance.toStatus}, next-job=${advance.enqueuedJobType ?? "none"})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          transcriptChars: transcriptText.length,
          audioSeconds: durationSeconds,
          nextStatus: advance.toStatus,
          enqueuedJobType: advance.enqueuedJobType,
          enqueuedJobId: advance.enqueuedJobId,
        },
      }
    );
  } catch (err) {
    // Best-effort: status='failed' + error_log + re-throw so claim-loop fails
    // the ai_job via rpc_fail_ai_job (existing pattern).
    try {
      await adminClient
        .from("walkthrough_session")
        .update({ status: "failed" })
        .eq("id", sessionId);
    } catch (statusFailErr) {
      captureException(statusFailErr, {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          walkthroughSessionId: sessionId,
          phase: "set-status-failed",
        },
      });
    }
    captureException(err, {
      source: LOG_SOURCE,
      metadata: {
        jobId: job.id,
        walkthroughSessionId: sessionId,
      },
    });
    throw err;
  } finally {
    if (webmFileWritten) {
      await rm(webmPath, { force: true }).catch(() => {});
    }
  }
}
