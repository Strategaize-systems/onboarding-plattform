import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";
import { extractText } from "@/lib/document-parser";
import {
  MAX_FILE_SIZE,
  sanitizeFilename,
  validateFileSize,
  validateMimeType,
} from "./validation";

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

  // V9.75 Tier-Gate (Schicht 1) — evidence_extraction verlangt >= blueprint.
  // Der Datei-Upload selbst ist kein gated job_type; nur die AI-Extraktion. Bei
  // zu niedriger Stufe wird der Extraktions-Job NICHT enqueued (kein 403 — die
  // Datei ist gespeichert). Bei ausreichender Stufe wird session_tier gestempelt.
  // Fix ISSUE-105: ohne Stempel + nicht-aufloesbarem Payload {evidence_file_id,
  // session_id} haette der Worker jeden evidence_extraction-Job fail-closed getoetet.
  const gate = await assertSessionTierAllows(
    adminClient,
    sessionId,
    "evidence_extraction"
  );
  if (gate.allowed) {
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
        session_tier: gate.tier,
      });
    } catch (enqueueErr) {
      console.error("[evidence-upload] Failed to enqueue extraction job:", enqueueErr);
    }
  } else {
    console.log(
      `[evidence-upload] evidence_extraction skipped (tier_gate_denied) for session ${sessionId}`
    );
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
            content: `Du bist ein strukturierter Dokumenten-Analyst. Dir wurde ein Dokument vorgelegt, das als Nachweis fuer eine Wissenserhebung hochgeladen wurde.

AUFGABE: Analysiere das Dokument im Kontext der Block-Fragen.

AUSGABE-FORMAT (exakt einhalten):

📄 Dokument: [Was fuer ein Dokument ist das — 1 Satz]

Kernaussagen:
• [Wichtigste Erkenntnis 1]
• [Wichtigste Erkenntnis 2]
• [Wichtigste Erkenntnis 3]
• [Optional: Erkenntnis 4]
• [Optional: Erkenntnis 5]

Relevanz: [Hoch | Mittel | Gering] — [Begruendung in 1 Satz]

Luecken: [Was deckt das Dokument NICHT ab, das fuer die Blockfragen relevant waere — 1-2 Saetze]

REGELN:
- Exakt dieses Format verwenden, keine Abweichungen
- Immer 3-5 Kernaussagen als Aufzaehlungspunkte mit •
- Relevanz immer als "Hoch", "Mittel" oder "Gering" bewerten
- Maximal 150 Woerter insgesamt
- Keine zusaetzlichen Ueberschriften oder Abschnitte
- Deutsch${questionContext}`,
          },
          {
            role: "user",
            content: `Analysiere dieses Dokument (${file.name}):\n\n${truncatedText}`,
          },
        ], { temperature: 0.1, maxTokens: 800 });

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
