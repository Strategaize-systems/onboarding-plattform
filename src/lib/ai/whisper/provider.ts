// Whisper Provider Interface
// All whisper/speech-to-text providers must implement this interface.
// Pattern: Adapter-Pattern per DEC-018, analog zu embeddings/provider.ts

export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Duration of the audio in milliseconds (if available) */
  duration_ms?: number;
}

export interface TranscriptionOptions {
  /** Language hint (e.g., "de", "en", "nl"). Auto-detected if omitted. */
  language?: string;
  /** Original filename for MIME type detection */
  filename?: string;
}

export interface WhisperProvider {
  /** Transcribe audio buffer to text */
  transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult>;

  /** Check if the provider is reachable and ready */
  isAvailable(): Promise<boolean>;

  /** Provider identifier for audit logging */
  providerId(): string;
}
