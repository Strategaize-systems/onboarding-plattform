// Azure Whisper Provider — Stub for future Azure Speech EU integration
// Not implemented in V2. Exists to complete the adapter pattern (DEC-018).
// When needed: implement Azure Speech SDK with EU region (westeurope).

import type {
  WhisperProvider,
  TranscriptionResult,
  TranscriptionOptions,
} from "./provider";

export class AzureWhisperProvider implements WhisperProvider {
  async transcribe(
    _audioBuffer: Buffer,
    _options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    throw new Error(
      "Azure Whisper provider is not configured. Set WHISPER_PROVIDER=local or configure Azure Speech credentials."
    );
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  providerId(): string {
    return "azure-whisper";
  }
}
