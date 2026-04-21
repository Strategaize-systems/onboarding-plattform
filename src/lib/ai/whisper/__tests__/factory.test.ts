import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getWhisperProvider,
  resetWhisperProvider,
} from "../factory";
import { LocalWhisperProvider } from "../local";
import { AzureWhisperProvider } from "../azure";

describe("Whisper Factory", () => {
  beforeEach(() => {
    resetWhisperProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetWhisperProvider();
  });

  it("returns LocalWhisperProvider by default (no env set)", () => {
    vi.stubEnv("WHISPER_PROVIDER", "");
    resetWhisperProvider();
    const provider = getWhisperProvider();
    expect(provider).toBeInstanceOf(LocalWhisperProvider);
    expect(provider.providerId()).toBe("local-whisper");
  });

  it("returns LocalWhisperProvider when WHISPER_PROVIDER=local", () => {
    vi.stubEnv("WHISPER_PROVIDER", "local");
    resetWhisperProvider();
    const provider = getWhisperProvider();
    expect(provider).toBeInstanceOf(LocalWhisperProvider);
  });

  it("returns AzureWhisperProvider when WHISPER_PROVIDER=azure", () => {
    vi.stubEnv("WHISPER_PROVIDER", "azure");
    resetWhisperProvider();
    const provider = getWhisperProvider();
    expect(provider).toBeInstanceOf(AzureWhisperProvider);
    expect(provider.providerId()).toBe("azure-whisper");
  });

  it("throws for unknown provider", () => {
    vi.stubEnv("WHISPER_PROVIDER", "openai");
    resetWhisperProvider();
    expect(() => getWhisperProvider()).toThrow(
      'Unknown whisper provider: "openai"'
    );
  });

  it("returns singleton on repeated calls", () => {
    vi.stubEnv("WHISPER_PROVIDER", "local");
    resetWhisperProvider();
    const a = getWhisperProvider();
    const b = getWhisperProvider();
    expect(a).toBe(b);
  });

  it("AzureWhisperProvider.transcribe throws not-configured error", async () => {
    const provider = new AzureWhisperProvider();
    await expect(
      provider.transcribe(Buffer.from("test"))
    ).rejects.toThrow("Azure Whisper provider is not configured");
  });

  it("AzureWhisperProvider.isAvailable returns false", async () => {
    const provider = new AzureWhisperProvider();
    expect(await provider.isAvailable()).toBe(false);
  });
});
