// V10.2 SLC-184 MT-1 — POST /api/admin/transcribe Auth + Wiring.
//
// Hermetisch: Gate (assertStrategaizeAdmin), Whisper-Provider und Logger gemockt —
// kein echter Supabase-/AWS-Call. Prueft 403 (kein Admin) / 400 (kein Audio) /
// 200 (Admin + Audio → Text) / 500 (Whisper-Throw, fail-open Meldung).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/workspace/admin-gate", () => ({
  assertStrategaizeAdmin: vi.fn(),
}));
vi.mock("@/lib/ai/whisper", () => ({
  getWhisperProvider: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

import { POST } from "../route";
import { assertStrategaizeAdmin } from "@/lib/workspace/admin-gate";
import { getWhisperProvider } from "@/lib/ai/whisper";

const gate = vi.mocked(assertStrategaizeAdmin);
const whisper = vi.mocked(getWhisperProvider);

function buildRequest(withAudio: boolean): Request {
  const fd = new FormData();
  if (withAudio) {
    fd.append("audio", new File([new Uint8Array([1, 2, 3])], "recording.webm", { type: "audio/webm" }));
  }
  return new Request("http://localhost/api/admin/transcribe", {
    method: "POST",
    body: fd,
  });
}

const ADMIN = { id: "admin-1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/transcribe", () => {
  it("403 ohne strategaize_admin", async () => {
    gate.mockResolvedValue(null);
    const res = await POST(buildRequest(true) as never);
    expect(res.status).toBe(403);
    expect(whisper).not.toHaveBeenCalled();
  });

  it("400 wenn kein Audio geliefert wird", async () => {
    gate.mockResolvedValue(ADMIN);
    const res = await POST(buildRequest(false) as never);
    expect(res.status).toBe(400);
  });

  it("200 + Text bei Admin + Audio", async () => {
    gate.mockResolvedValue(ADMIN);
    whisper.mockReturnValue({
      transcribe: vi.fn().mockResolvedValue({ text: "hallo welt", duration_ms: 1200 }),
    } as never);

    const res = await POST(buildRequest(true) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("hallo welt");
    expect(body.duration_ms).toBe(1200);
  });

  it("500 fail-open bei Whisper-Fehler", async () => {
    gate.mockResolvedValue(ADMIN);
    whisper.mockReturnValue({
      transcribe: vi.fn().mockRejectedValue(new Error("whisper down")),
    } as never);

    const res = await POST(buildRequest(true) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Transkription fehlgeschlagen");
  });
});
