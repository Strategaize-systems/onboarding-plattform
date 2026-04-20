import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractText } from "@/lib/document-parser";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/zip",
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/** Validate MIME type. Returns error message or null. */
export function validateMimeType(mimeType: string): string | null {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return `MIME-Type '${mimeType}' nicht erlaubt. Erlaubt: PDF, DOCX, TXT, CSV, ZIP`;
  }
  return null;
}

/** Validate file size. Returns error message or null. */
export function validateFileSize(sizeBytes: number): string | null {
  if (sizeBytes === 0) {
    return "Leere Datei";
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    return `Datei zu gross (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB`;
  }
  return null;
}

/** Sanitize filename for storage path. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * POST /api/capture/[sessionId]/evidence/upload
 * Upload an evidence file to Supabase Storage and create an evidence_file row.
 *
 * Auth: session owner (tenant_admin/member) or strategaize_admin.
 * Request: multipart/form-data { file: File, blockKey?: string }
 * Response: 201 { id, filename, status }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;

  // --- Auth ---
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nicht authentifiziert" } },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Profil nicht gefunden" } },
      { status: 401 }
    );
  }

  // --- Session ownership check ---
  const adminClient = createAdminClient();

  const { data: session } = await adminClient
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Session nicht gefunden" } },
      { status: 404 }
    );
  }

  // strategaize_admin has cross-tenant access; others must match tenant
  if (
    profile.role !== "strategaize_admin" &&
    session.tenant_id !== profile.tenant_id
  ) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Kein Zugriff auf diese Session" } },
      { status: 403 }
    );
  }

  // --- Parse multipart form data ---
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Multipart form data erwartet" } },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Feld 'file' fehlt oder ist keine Datei" } },
      { status: 400 }
    );
  }

  const blockKey = formData.get("blockKey") as string | null;

  // --- Validate MIME type ---
  const mimeError = validateMimeType(file.type);
  if (mimeError) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: mimeError } },
      { status: 400 }
    );
  }

  // --- Validate file size ---
  const sizeError = validateFileSize(file.size);
  if (sizeError) {
    const status = file.size > MAX_FILE_SIZE ? 413 : 400;
    const code = file.size > MAX_FILE_SIZE ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
    return NextResponse.json(
      { error: { code, message: sizeError } },
      { status }
    );
  }

  // --- Sanitize filename ---
  const safeName = sanitizeFilename(file.name);
  const timestamp = Date.now();
  const storagePath = `${session.tenant_id}/${sessionId}/${timestamp}_${safeName}`;

  // --- Upload to Supabase Storage ---
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await adminClient.storage
    .from("evidence")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Upload fehlgeschlagen: ${uploadError.message}`,
        },
      },
      { status: 500 }
    );
  }

  // --- Insert evidence_file row ---
  const { data: evidenceFile, error: insertError } = await adminClient
    .from("evidence_file")
    .insert({
      tenant_id: session.tenant_id,
      capture_session_id: sessionId,
      block_key: blockKey || null,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      extraction_status: "pending",
      created_by: user.id,
    })
    .select("id, original_filename, extraction_status")
    .single();

  if (insertError) {
    // Cleanup uploaded file if DB insert fails
    await adminClient.storage.from("evidence").remove([storagePath]);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `DB-Eintrag fehlgeschlagen: ${insertError.message}`,
        },
      },
      { status: 500 }
    );
  }

  // Enqueue evidence_extraction job for async processing (chunking + mapping)
  try {
    await adminClient.from("ai_jobs").insert({
      tenant_id: session.tenant_id,
      job_type: "evidence_extraction",
      payload: {
        evidence_file_id: evidenceFile.id,
        session_id: sessionId,
      },
      status: "pending",
    });
  } catch (enqueueErr) {
    console.error("[evidence-upload] Failed to enqueue extraction job:", enqueueErr);
  }

  // --- Async KI Document Analysis (ported from Blueprint) ---
  // Extract text inline, then fire-and-forget LLM analysis.
  // Result is saved as capture_events entry with event_type='document_analysis'.
  const extractedText = await extractText(buffer, file.type, file.name).catch(() => null);

  if (extractedText && blockKey) {
    (async () => {
      try {
        const { chatWithLLM } = await import("@/lib/llm");

        const truncatedText = extractedText.length > 4000
          ? extractedText.slice(0, 4000) + "\n\n[... Dokument gekuerzt ...]"
          : extractedText;

        // Load question context if available (first question of the block)
        const { data: sessionData } = await adminClient
          .from("capture_session")
          .select("template_id")
          .eq("id", sessionId)
          .single();

        let questionContext = "";
        if (sessionData?.template_id) {
          const { data: template } = await adminClient
            .from("template")
            .select("blocks")
            .eq("id", sessionData.template_id)
            .single();

          if (template?.blocks) {
            const blocks = template.blocks as Array<{
              key: string;
              title?: Record<string, string> | string;
              questions?: Array<{ text?: Record<string, string> | string }>;
            }>;
            const block = blocks.find((b) => b.key === blockKey);
            if (block) {
              const blockTitle = typeof block.title === "object" ? block.title.de ?? "" : block.title ?? "";
              const questions = (block.questions ?? [])
                .slice(0, 5)
                .map((q) => typeof q.text === "object" ? q.text.de ?? "" : q.text ?? "")
                .filter(Boolean);
              questionContext = `\nBlock: ${blockTitle}\nFragen in diesem Block:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
            }
          }
        }

        const analysis = await chatWithLLM([
          {
            role: "system",
            content: `Du bist ein erfahrener Berater. Dir wurde ein Dokument vorgelegt, das als Nachweis fuer eine strukturierte Wissenserhebung hochgeladen wurde.

DEINE AUFGABE:
Analysiere das Dokument und gib strukturiertes Feedback.

REGELN:
1. Beginne mit einer kurzen Einordnung: Was fuer ein Dokument ist das?
2. Nenne die 3-5 wichtigsten Erkenntnisse aus dem Dokument
3. Bewerte: Wie relevant ist das Dokument fuer die Fragen in diesem Block?
4. Nenne konkret was das Dokument NICHT abdeckt
5. Halte dich kurz und praegnant (max. 200 Woerter)
6. Verwende Aufzaehlungspunkte${questionContext}`,
          },
          {
            role: "user",
            content: `Bitte analysiere folgendes Dokument (${file.name}):\n\n${truncatedText}`,
          },
        ], { temperature: 0.3, maxTokens: 1024 });

        // Save as capture_events entry
        await adminClient.from("capture_events").insert({
          session_id: sessionId,
          tenant_id: session.tenant_id,
          block_key: blockKey,
          question_id: "_document_analysis",
          client_event_id: crypto.randomUUID(),
          event_type: "document_analysis",
          payload: {
            text: analysis,
            file_name: file.name,
            evidence_file_id: evidenceFile.id,
          },
          created_by: user.id,
        });
      } catch (err) {
        const { captureException: logErr } = await import("@/lib/logger");
        logErr(err, {
          source: "evidence/document-analysis",
          metadata: { fileId: evidenceFile.id, fileName: file.name },
        });
      }
    })();
  }

  return NextResponse.json(
    {
      id: evidenceFile.id,
      filename: evidenceFile.original_filename,
      status: evidenceFile.extraction_status,
    },
    { status: 201 }
  );
}
