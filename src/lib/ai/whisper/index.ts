// Whisper module re-exports
export type {
  WhisperProvider,
  TranscriptionResult,
  TranscriptionOptions,
} from "./provider";
export { LocalWhisperProvider } from "./local";
export { AzureWhisperProvider } from "./azure";
export { getWhisperProvider, resetWhisperProvider } from "./factory";
