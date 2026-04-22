// Audio Extraction Utility — MP4 → WAV via ffmpeg
// SLC-030 MT-4 (FEAT-020)
//
// ffmpeg is installed in the worker Docker image (node:22-alpine + apk add ffmpeg).
// Extracts mono 16kHz PCM audio suitable for Whisper transcription.

import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface AudioExtractResult {
  wavPath: string;
  durationSeconds: number;
  cleanup: () => Promise<void>;
}

/**
 * Extract audio from an MP4 file as 16kHz mono WAV for Whisper.
 *
 * Returns the path to the temporary WAV file and a cleanup function.
 * Caller MUST call cleanup() after processing.
 */
export async function extractAudioFromMp4(
  mp4Path: string
): Promise<AudioExtractResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "dialogue-audio-"));
  const wavPath = join(tempDir, "audio.wav");

  // ffmpeg: extract audio, convert to 16kHz mono PCM WAV
  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-i", mp4Path,
        "-vn",              // no video
        "-acodec", "pcm_s16le", // 16-bit PCM
        "-ar", "16000",     // 16kHz sample rate (Whisper optimal)
        "-ac", "1",         // mono
        "-y",               // overwrite
        wavPath,
      ],
      { timeout: 300_000 }, // 5 min timeout for long recordings
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg failed: ${error.message}\n${stderr}`));
        } else {
          resolve();
        }
      }
    );
  });

  // Get file size to estimate duration
  const wavStat = await stat(wavPath);
  // WAV 16kHz mono 16-bit: 32000 bytes/second
  const durationSeconds = Math.round(wavStat.size / 32000);

  const cleanup = async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  };

  return { wavPath, durationSeconds, cleanup };
}

/**
 * Extract audio from an in-memory MP4 buffer.
 * Writes to temp file, extracts, returns WAV buffer.
 */
export async function extractAudioBuffer(
  mp4Buffer: Buffer
): Promise<{ wavBuffer: Buffer; durationSeconds: number }> {
  const { writeFile, readFile } = await import("node:fs/promises");

  const tempDir = await mkdtemp(join(tmpdir(), "dialogue-mp4-"));
  const mp4Path = join(tempDir, "input.mp4");

  try {
    await writeFile(mp4Path, mp4Buffer);
    const { wavPath, durationSeconds, cleanup } = await extractAudioFromMp4(mp4Path);

    try {
      const wavBuffer = await readFile(wavPath);
      return { wavBuffer, durationSeconds };
    } finally {
      await cleanup();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
