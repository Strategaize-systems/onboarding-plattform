// V10.2 SLC-184 MT-1 — POST /api/admin/transcribe
//
// Duenne strategaize_admin-gated Transcribe-Route fuer den Berater-Workspace
// "Mein Tag". Tenant-agnostisch (der Berater arbeitet cross-Mandant). Audio wird
// nur in-memory verarbeitet und NIE persistiert (DEC-017, DSGVO).
//
// Pattern-Reuse: src/app/api/capture/[sessionId]/transcribe/route.ts (Whisper-Adapter,
// Multipart-Handling, Groessen-Limit) — hier ohne Session-Ownership, dafuer mit
// strategaize_admin-Gate statt Tenant-Match.

import { NextRequest, NextResponse } from "next/server";

import { getWhisperProvider } from "@/lib/ai/whisper";
import { assertStrategaizeAdmin } from "@/lib/workspace/admin-gate";

export async function POST(request: NextRequest) {
  // Gate: strategaize_admin (eigenstaendiger Entry-Point, R-184-4).
  const user = await assertStrategaizeAdmin();
  if (!user) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Parse multipart/form-data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  // 25 MB limit
  if (audioFile.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 413 },
    );
  }

  try {
    const whisper = getWhisperProvider();
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await whisper.transcribe(buffer, {
      filename: audioFile.name || "recording.webm",
      language: "de", // Default: German (primary use case)
    });

    return NextResponse.json({
      text: result.text,
      duration_ms: result.duration_ms ?? null,
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/admin/transcribe" });
    return NextResponse.json(
      {
        error: `Transkription fehlgeschlagen: ${
          error instanceof Error ? error.message : "Unbekannter Fehler"
        }`,
      },
      { status: 500 },
    );
  }
}
