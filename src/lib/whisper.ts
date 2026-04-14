// Whisper Speech-to-Text via REST API
// Runs locally on Hetzner — no external API calls (DSGVO-konform)
// Audio is processed in-memory only — never stored (DEC-017)

const WHISPER_BASE_URL = process.env.WHISPER_URL || "http://whisper:9000";

export interface TranscriptionResult {
  text: string;
}

/**
 * Transcribe audio via the Whisper ASR webservice.
 *
 * @param audioBuffer - Raw audio data (WebM, WAV, MP3, etc.)
 * @param filename - Original filename (used for MIME type detection by Whisper)
 * @param language - Optional language hint (de, en, nl). Auto-detected if omitted.
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  language?: string
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append(
    "audio_file",
    new Blob([new Uint8Array(audioBuffer)]),
    filename
  );

  // Build query parameters
  const params = new URLSearchParams({
    task: "transcribe",
    output: "json",
  });
  if (language) {
    params.set("language", language);
  }

  const res = await fetch(`${WHISPER_BASE_URL}/asr?${params.toString()}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Whisper error: ${res.status} — ${errorText}`);
  }

  const data = await res.json();
  return { text: data.text ?? "" };
}

/**
 * Check if the Whisper service is reachable.
 */
export async function isWhisperAvailable(): Promise<boolean> {
  try {
    const res = await fetch(WHISPER_BASE_URL, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
