import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWhisperProvider } from "@/lib/ai/whisper";

/**
 * POST /api/capture/[sessionId]/transcribe
 * Upload audio and get transcription via Whisper adapter.
 * Audio is processed in-memory only — never stored (DEC-017, DSGVO).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 403 });
  }

  // Verify session ownership
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Parse multipart/form-data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json(
      { error: "No audio file provided" },
      { status: 400 }
    );
  }

  // 25 MB limit
  if (audioFile.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 413 }
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
    captureException(error, { source: "api/capture/transcribe", metadata: { sessionId } });
    return NextResponse.json(
      {
        error: `Transkription fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      },
      { status: 500 }
    );
  }
}
