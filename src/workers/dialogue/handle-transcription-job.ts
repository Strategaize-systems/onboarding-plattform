// Worker Handler: dialogue_transcription
// SLC-030 MT-3+5 (FEAT-020)
//
// Flow:
// 1. Load dialogue_session from DB
// 2. Download MP4 from Supabase Storage
// 3. Extract audio via ffmpeg (MP4 → WAV)
// 4. Transcribe via Whisper (self-hosted, 16kHz mono)
// 5. Save transcript to dialogue_session
// 6. Update status: transcribing → processing
// 7. Enqueue dialogue_extraction job
// 8. Mark ai_job complete

import { createAdminClient } from "../../lib/supabase/admin";
import { getWhisperProvider } from "../../lib/ai/whisper/factory";
import { extractAudioBuffer } from "./audio-extract";
import type { ClaimedJob } from "../condensation/claim-loop";

interface TranscriptionPayload {
  dialogue_session_id: string;
  recording_storage_path: string;
}

export async function handleTranscriptionJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const startTime = Date.now();

  console.log(
    `[dialogue-transcription] Processing job ${job.id} for tenant ${job.tenant_id}`
  );

  const payload = job.payload as unknown as TranscriptionPayload;
  const { dialogue_session_id, recording_storage_path } = payload;

  if (!dialogue_session_id || !recording_storage_path) {
    throw new Error(
      "Transcription job payload missing required fields (dialogue_session_id, recording_storage_path)"
    );
  }

  // 1. Update status to 'transcribing'
  const { error: statusError } = await adminClient
    .from("dialogue_session")
    .update({ status: "transcribing" })
    .eq("id", dialogue_session_id);

  if (statusError) {
    throw new Error(`Failed to update status to transcribing: ${statusError.message}`);
  }

  console.log(`[dialogue-transcription] Status → transcribing (session=${dialogue_session_id})`);

  // 2. Download MP4 from Supabase Storage
  const { data: fileData, error: downloadError } = await adminClient
    .storage
    .from("recordings")
    .download(recording_storage_path);

  if (downloadError || !fileData) {
    throw new Error(
      `Failed to download recording: ${downloadError?.message ?? "no data"}`
    );
  }

  const mp4Buffer = Buffer.from(await fileData.arrayBuffer());
  console.log(
    `[dialogue-transcription] Downloaded MP4: ${(mp4Buffer.length / 1024 / 1024).toFixed(1)} MB`
  );

  // 3. Extract audio via ffmpeg (MP4 → WAV 16kHz mono)
  const { wavBuffer, durationSeconds } = await extractAudioBuffer(mp4Buffer);
  console.log(
    `[dialogue-transcription] Audio extracted: ${(wavBuffer.length / 1024 / 1024).toFixed(1)} MB, ~${durationSeconds}s`
  );

  // Save recording duration
  await adminClient
    .from("dialogue_session")
    .update({ recording_duration_s: durationSeconds })
    .eq("id", dialogue_session_id);

  // 4. Transcribe via Whisper
  const whisper = getWhisperProvider();
  const available = await whisper.isAvailable();
  if (!available) {
    throw new Error("Whisper service is not available");
  }

  console.log(`[dialogue-transcription] Starting Whisper transcription (~${durationSeconds}s audio)...`);

  const transcriptionResult = await whisper.transcribe(wavBuffer, {
    language: "de",
    filename: "recording.wav",
  });

  const transcript = transcriptionResult.text;
  const transcriptModel = `whisper-${process.env.WHISPER_MODEL || "medium"}`;
  const whisperDuration = Date.now() - startTime;

  console.log(
    `[dialogue-transcription] Whisper done: ${transcript.length} chars, ${(whisperDuration / 1000).toFixed(1)}s`
  );

  // 5. Save transcript to dialogue_session
  const { error: transcriptError } = await adminClient.rpc(
    "rpc_save_dialogue_transcript",
    {
      p_dialogue_session_id: dialogue_session_id,
      p_transcript: transcript,
      p_transcript_model: transcriptModel,
    }
  );

  if (transcriptError) {
    throw new Error(`Failed to save transcript: ${transcriptError.message}`);
  }

  // 6. Update status to 'processing' (ready for KI extraction)
  const { error: statusError2 } = await adminClient
    .from("dialogue_session")
    .update({ status: "processing" })
    .eq("id", dialogue_session_id);

  if (statusError2) {
    throw new Error(`Failed to update status to processing: ${statusError2.message}`);
  }

  console.log(`[dialogue-transcription] Status → processing`);

  // 7. Enqueue dialogue_extraction job (SLC-031)
  const { error: enqueueError } = await adminClient.from("ai_jobs").insert({
    tenant_id: job.tenant_id,
    job_type: "dialogue_extraction",
    payload: {
      dialogue_session_id,
    },
    status: "pending",
  });

  if (enqueueError) {
    // Non-fatal — extraction can be re-triggered manually
    console.error(
      `[dialogue-transcription] Failed to enqueue extraction job: ${enqueueError.message}`
    );
  } else {
    console.log(`[dialogue-transcription] Enqueued dialogue_extraction job`);
  }

  // 8. Mark ai_job complete
  const { error: completeError } = await adminClient.rpc(
    "rpc_complete_ai_job",
    { p_job_id: job.id }
  );

  if (completeError) {
    throw new Error(`Failed to complete job: ${completeError.message}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[dialogue-transcription] Job complete: session=${dialogue_session_id}, ` +
    `duration=${(totalDuration / 1000).toFixed(1)}s, ` +
    `transcript=${transcript.length} chars`
  );
}
