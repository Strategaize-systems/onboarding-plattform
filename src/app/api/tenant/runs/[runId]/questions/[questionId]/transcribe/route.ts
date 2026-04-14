import { NextResponse } from "next/server";
import { requireTenant, errorResponse, getTenantLocale } from "@/lib/api-utils";
import { transcribeAudio } from "@/lib/whisper";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

// POST /api/tenant/runs/[runId]/questions/[questionId]/transcribe
// Transcribe audio via Whisper ASR service
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile } = auth;
  await params; // validate route params exist

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Expected multipart/form-data with audio file", 400);
  }

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return errorResponse("VALIDATION_ERROR", "No audio file provided. Send as 'audio' field.", 400);
  }

  // Validate file size
  if (audioFile.size > MAX_AUDIO_SIZE) {
    return errorResponse(
      "PAYLOAD_TOO_LARGE",
      `Audio file too large (${Math.round(audioFile.size / 1024 / 1024)}MB). Maximum: 25MB.`,
      413
    );
  }

  // Validate MIME type
  if (!audioFile.type.startsWith("audio/") && !audioFile.type.startsWith("video/webm")) {
    return errorResponse("VALIDATION_ERROR", `Invalid file type: ${audioFile.type}. Expected audio/*`, 400);
  }

  // Get tenant locale as language hint for Whisper
  const locale = await getTenantLocale(supabase, profile!.tenant_id);

  // Convert File to Buffer and send to Whisper
  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = audioFile.name || "recording.webm";

    const result = await transcribeAudio(buffer, filename, locale);

    return NextResponse.json({
      transcript: result.text,
      language: locale,
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/transcribe", metadata: { locale } });

    // Distinguish Whisper unavailable from other errors
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      return errorResponse(
        "SERVICE_UNAVAILABLE",
        "Whisper service is not available. Please try again later.",
        503
      );
    }

    return errorResponse(
      "INTERNAL_ERROR",
      `Transcription failed: ${message}`,
      500
    );
  }
}
