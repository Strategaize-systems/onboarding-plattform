import { NextResponse } from "next/server";
import { requireTenant, errorResponse, getTenantLocale } from "@/lib/api-utils";
import { transcribeAudio } from "@/lib/whisper";

// POST /api/tenant/transcribe — Generic transcription endpoint (for profile, etc.)
export async function POST(request: Request) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile } = auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Expected multipart/form-data", 400);
  }

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return errorResponse("VALIDATION_ERROR", "No audio file provided", 400);
  }

  if (audioFile.size > 25 * 1024 * 1024) {
    return errorResponse("PAYLOAD_TOO_LARGE", "Audio file too large (max 25MB)", 413);
  }

  // Get tenant locale for language hint
  const locale = await getTenantLocale(supabase, profile!.tenant_id);

  try {
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await transcribeAudio(buffer, audioFile.name || "recording.webm", locale);

    return NextResponse.json({
      transcript: result.text,
      language: locale,
    });
  } catch (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(error, { source: "api/tenant/transcribe" });
    return errorResponse(
      "INTERNAL_ERROR",
      `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}
