import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import {
  createEvidenceNoteSchema,
  EVIDENCE_LABELS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { extractText } from "@/lib/document-parser";

// POST /api/tenant/runs/[runId]/evidence — Upload file or add text note
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { user, profile, supabase } = auth;
  const { runId } = await params;

  // Verify run belongs to tenant and is not locked
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, tenant_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.status === "locked") {
    return errorResponse("FORBIDDEN", "Run is locked — no further uploads allowed", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";

  // === JSON note ===
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
    }

    const parsed = createEvidenceNoteSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { note_text, label, question_id, relation: noteRelation } = parsed.data;

    // If question_id provided, verify it belongs to the run's catalog
    if (question_id) {
      const { data: q } = await supabase
        .from("questions")
        .select("id")
        .eq("id", question_id)
        .single();
      if (!q) {
        return errorResponse("NOT_FOUND", "Question not found", 404);
      }
    }

    // INSERT evidence_item (append-only)
    const { data: item, error: insertError } = await supabase
      .from("evidence_items")
      .insert({
        tenant_id: profile!.tenant_id,
        run_id: runId,
        item_type: "note",
        label,
        note_text,
        created_by: user!.id,
      })
      .select("id, item_type, label, note_text, created_at")
      .single();

    if (insertError) {
      return errorResponse("INTERNAL_ERROR", insertError.message, 500);
    }

    // If question_id provided, create evidence_link with specified or default relation
    if (question_id) {
      await supabase.from("evidence_links").insert({
        evidence_item_id: item.id,
        tenant_id: profile!.tenant_id,
        link_type: "question",
        link_id: question_id,
        relation: noteRelation ?? "supports",
      });

      // Also log evidence_attached event
      await supabase.from("question_events").insert({
        client_event_id: crypto.randomUUID(),
        question_id,
        run_id: runId,
        tenant_id: profile!.tenant_id,
        event_type: "evidence_attached",
        payload: { evidence_item_id: item.id },
        created_by: user!.id,
      });
    }

    return NextResponse.json({ evidence_item: item }, { status: 201 });
  }

  // === File upload (multipart/form-data) ===
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid form data", 400);
    }

    const file = formData.get("file") as File | null;
    const label = formData.get("label") as string | null;
    const questionId = formData.get("question_id") as string | null;
    const relation = formData.get("relation") as string | null;

    if (!file || !(file instanceof File)) {
      return errorResponse("VALIDATION_ERROR", "Datei ist erforderlich", 400);
    }

    if (!label || !(EVIDENCE_LABELS as readonly string[]).includes(label)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Label ist erforderlich. Erlaubt: ${EVIDENCE_LABELS.join(", ")}`,
        400
      );
    }

    // Validate MIME type
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Nur PDF, DOCX, Excel und Bilddateien werden akzeptiert.",
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Datei überschreitet das 200 MB Limit.",
        400
      );
    }

    // If question_id provided, verify it
    if (questionId) {
      const { data: q } = await supabase
        .from("questions")
        .select("id")
        .eq("id", questionId)
        .single();
      if (!q) {
        return errorResponse("NOT_FOUND", "Question not found", 404);
      }
    }

    // Sanitize file name (strip path traversal, limit length)
    const safeName = file.name
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\.{2,}/g, ".")
      .slice(0, 255);

    // Read file into buffer for SHA256 + upload + text extraction
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // Extract text BEFORE insert (avoids append-only trigger on UPDATE)
    let extractedText: string | null = null;
    try {
      extractedText = await extractText(buffer, file.type, safeName);
    } catch (extractError) {
      const { captureException } = await import("@/lib/logger");
      captureException(extractError, {
        source: "evidence/text-extraction",
        metadata: { fileName: safeName, mimeType: file.type },
      });
    }

    // Generate item ID upfront so we can use it in the storage path
    const itemId = crypto.randomUUID();
    const adminClient = createAdminClient();
    const storagePath = `${profile!.tenant_id}/${runId}/${itemId}/${safeName}`;

    // Ensure bucket exists
    const { error: bucketError } = await adminClient.storage.createBucket("evidence", {
      public: false,
    });
    // Ignore "already exists" errors
    if (bucketError && !bucketError.message?.includes("already exists")) {
      // Non-critical: bucket might already exist
    }

    // Upload FIRST — if this fails, no orphaned DB record is created
    const { error: uploadError } = await adminClient.storage
      .from("evidence")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return errorResponse(
        "INTERNAL_ERROR",
        `Datei-Upload fehlgeschlagen: ${uploadError.message}`,
        500
      );
    }

    // INSERT evidence_item via adminClient (bypasses RLS — already validated above)
    const { data: item, error: insertError } = await adminClient
      .from("evidence_items")
      .insert({
        id: itemId,
        tenant_id: profile!.tenant_id,
        run_id: runId,
        item_type: "file",
        label,
        file_name: safeName,
        file_path: `evidence/${storagePath}`,
        file_size_bytes: file.size,
        file_mime_type: file.type,
        sha256,
        extracted_text: extractedText,
        created_by: user!.id,
      })
      .select("id, item_type, label, file_name, file_path, file_size_bytes, file_mime_type, sha256, created_at")
      .single();

    if (insertError) {
      // Storage upload succeeded but DB insert failed — cleanup storage
      await adminClient.storage.from("evidence").remove([storagePath]);
      return errorResponse("INTERNAL_ERROR", insertError.message, 500);
    }

    // LLM document analysis (async, non-blocking for response)
    if (extractedText && questionId) {
      // Capture tenant locale before the async IIFE (profile is available here)
      const tenantLocale = await (async () => {
        const { data: t } = await adminClient.from("tenants").select("language").eq("id", profile!.tenant_id).single();
        return (t?.language ?? "de") as string;
      })();

      (async () => {
        try {
          const { chatWithLLM, getSystemPrompts, buildOwnerContext } = await import("@/lib/llm");
          const prompts = getSystemPrompts(tenantLocale);

          // Load owner profile for document analysis context (V2.2)
          const { data: ownerProfileData } = await adminClient
            .from("owner_profiles")
            .select("*")
            .eq("tenant_id", profile!.tenant_id)
            .single();
          const ownerContext = buildOwnerContext(ownerProfileData, tenantLocale);

          // Get question context
          const { data: question } = await adminClient
            .from("questions")
            .select("fragetext, block, unterbereich, ebene")
            .eq("id", questionId)
            .single();

          if (question) {
            const truncateLabel = { de: "[... Dokument gekürzt ...]", en: "[... Document truncated ...]", nl: "[... Document ingekort ...]" };
            const truncLabel = truncateLabel[tenantLocale as keyof typeof truncateLabel] ?? truncateLabel.de;
            // Truncate text to ~4000 chars to stay within LLM context
            const truncatedText = extractedText.length > 4000
              ? extractedText.slice(0, 4000) + `\n\n${truncLabel}`
              : extractedText;

            const questionLabel = tenantLocale === "en" ? "Question" : tenantLocale === "nl" ? "Vraag" : "Frage";
            const typeLabel = tenantLocale === "de" ? "Typ" : "Type";
            const analyzeLabel = tenantLocale === "en" ? `Please analyze the following document (${safeName}):` : tenantLocale === "nl" ? `Analyseer het volgende document (${safeName}):` : `Bitte analysiere folgendes Dokument (${safeName}):`;

            const analysis = await chatWithLLM([
              {
                role: "system",
                content: `${prompts.dokumentAnalyse}${ownerContext ? `\n\n${ownerContext}` : ""}\n\n${questionLabel}: "${question.fragetext}"\nBlock: ${question.block} / ${question.unterbereich}\n${typeLabel}: ${question.ebene}`,
              },
              {
                role: "user",
                content: `${analyzeLabel}\n\n${truncatedText}`,
              },
            ], { temperature: 0.3, maxTokens: 1024 });

            // Save analysis as question event
            await adminClient.from("question_events").insert({
              client_event_id: crypto.randomUUID(),
              question_id: questionId,
              run_id: runId,
              tenant_id: profile!.tenant_id,
              event_type: "document_analysis",
              payload: { text: analysis, file_name: safeName, evidence_item_id: itemId },
              created_by: user!.id,
            });
          }
        } catch (err) {
          const { captureException } = await import("@/lib/logger");
          captureException(err, {
            source: "evidence/document-analysis",
            metadata: { itemId, questionId, fileName: safeName, hasText: !!extractedText },
          });
        }
      })();
    }

    // If question_id provided, create evidence_link + event (default relation: supports)
    const validRelations = ["proof", "supports", "example", "supersedes"];
    const effectiveRelation = relation && validRelations.includes(relation) ? relation : "supports";

    if (questionId) {
      await adminClient.from("evidence_links").insert({
        evidence_item_id: item.id,
        tenant_id: profile!.tenant_id,
        link_type: "question",
        link_id: questionId,
        relation: effectiveRelation,
      });

      await adminClient.from("question_events").insert({
        client_event_id: crypto.randomUUID(),
        question_id: questionId,
        run_id: runId,
        tenant_id: profile!.tenant_id,
        event_type: "evidence_attached",
        payload: { evidence_item_id: item.id },
        created_by: user!.id,
      });
    }

    return NextResponse.json(
      {
        evidence_item: {
          ...item,
          file_path: `evidence/${storagePath}`,
        },
      },
      { status: 201 }
    );
  }

  return errorResponse(
    "VALIDATION_ERROR",
    "Content-Type muss application/json oder multipart/form-data sein",
    400
  );
}

// GET /api/tenant/runs/[runId]/evidence — List evidence items
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;

  const url = new URL(request.url);
  const questionId = url.searchParams.get("question_id");

  // Verify run access (RLS handles tenant isolation)
  const { data: run } = await supabase
    .from("runs")
    .select("id")
    .eq("id", runId)
    .single();

  if (!run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Get evidence items for this run
  let query = supabase
    .from("evidence_items")
    .select("id, item_type, label, file_name, file_size_bytes, file_mime_type, note_text, sha256, created_at, created_by")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(500);

  // Get evidence items, then filter by question_id via evidence_links if needed
  const { data: items, error } = await query;

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  let result = items ?? [];

  // If question_id filter, get linked evidence item IDs
  if (questionId) {
    const { data: links } = await supabase
      .from("evidence_links")
      .select("evidence_item_id, relation")
      .eq("link_type", "question")
      .eq("link_id", questionId);

    const linkedIds = new Set((links ?? []).map((l) => l.evidence_item_id));
    const relationMap = new Map(
      (links ?? []).map((l) => [l.evidence_item_id, l.relation])
    );

    result = result
      .filter((item) => linkedIds.has(item.id))
      .map((item) => ({ ...item, relation: relationMap.get(item.id) ?? null }));
  }

  return NextResponse.json({ evidence_items: result });
}
