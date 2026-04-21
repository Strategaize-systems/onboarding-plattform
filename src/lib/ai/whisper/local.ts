// Local Whisper Provider — self-hosted on Hetzner (DSGVO-konform)
// Connects to onerahmet/openai-whisper-asr-webservice container via Docker network.
// Audio is processed in-memory only — never stored (DEC-017).

import type {
  WhisperProvider,
  TranscriptionResult,
  TranscriptionOptions,
} from "./provider";

const DEFAULT_URL = "http://whisper:9000";

export class LocalWhisperProvider implements WhisperProvider {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.WHISPER_URL || DEFAULT_URL;
  }

  async transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append(
      "audio_file",
      new Blob([new Uint8Array(audioBuffer)]),
      options?.filename || "recording.webm"
    );

    const params = new URLSearchParams({
      task: "transcribe",
      output: "json",
    });
    if (options?.language) {
      params.set("language", options.language);
    }

    const res = await fetch(`${this.baseUrl}/asr?${params.toString()}`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Whisper transcription failed: ${res.status} — ${errorText}`);
    }

    const data = await res.json();
    return {
      text: data.text ?? "",
      duration_ms: undefined, // local whisper does not return duration
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  providerId(): string {
    return "local-whisper";
  }
}
