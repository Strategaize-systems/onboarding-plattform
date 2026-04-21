// Whisper Provider Factory
// Reads WHISPER_PROVIDER ENV to select the implementation.
// Default: local (self-hosted on Hetzner, DSGVO-konform)
// Pattern: analog zu embeddings/factory.ts

import type { WhisperProvider } from "./provider";
import { LocalWhisperProvider } from "./local";
import { AzureWhisperProvider } from "./azure";

let instance: WhisperProvider | null = null;

export function getWhisperProvider(): WhisperProvider {
  if (instance) return instance;

  const provider = process.env.WHISPER_PROVIDER || "local";

  switch (provider) {
    case "local":
      instance = new LocalWhisperProvider();
      break;
    case "azure":
      instance = new AzureWhisperProvider();
      break;
    default:
      throw new Error(
        `Unknown whisper provider: "${provider}". Supported: local, azure`
      );
  }

  return instance;
}

/** Reset singleton — only for testing */
export function resetWhisperProvider(): void {
  instance = null;
}
