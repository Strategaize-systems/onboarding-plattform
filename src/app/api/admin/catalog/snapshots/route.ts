import { NextResponse } from "next/server";
import { requireAdmin, errorResponse, validationError } from "@/lib/api-utils";
import { importCatalogSchema } from "@/lib/validations";
import { createHash } from "crypto";

// GET /api/admin/catalog/snapshots — List all catalog snapshots
export async function GET() {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;

  const { data: snapshots, error } = await adminClient!
    .from("question_catalog_snapshots")
    .select("id, version, blueprint_version, language, question_count, hash, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ snapshots: snapshots ?? [] });
}

// POST /api/admin/catalog/snapshots — Import a new catalog snapshot (JSON)
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { user, supabase, adminClient } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = importCatalogSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { version, blueprint_version, language, survey_type, questions } = parsed.data;

  // Check version+language+survey_type uniqueness
  const { data: existing } = await adminClient!
    .from("question_catalog_snapshots")
    .select("id")
    .eq("version", version)
    .eq("language", language)
    .eq("survey_type", survey_type)
    .single();

  if (existing) {
    return errorResponse(
      "CONFLICT",
      `Katalog-Version "${version}" (${language.toUpperCase()}, ${survey_type}) existiert bereits`,
      409
    );
  }

  // Compute hash of catalog content for integrity (ALL question fields)
  const catalogContent = JSON.stringify(
    questions.map((q) => ({
      frage_id: q.frage_id,
      block: q.block,
      ebene: q.ebene,
      unterbereich: q.unterbereich,
      fragetext: q.fragetext,
      owner_dependency: q.owner_dependency,
      deal_blocker: q.deal_blocker,
      sop_trigger: q.sop_trigger,
      ko_hart: q.ko_hart,
      ko_soft: q.ko_soft,
      block_weight: q.block_weight,
      position: q.position,
    }))
  );
  const hash = createHash("sha256").update(catalogContent).digest("hex");

  // Insert catalog snapshot
  const { data: snapshot, error: snapError } = await adminClient!
    .from("question_catalog_snapshots")
    .insert({
      version,
      blueprint_version,
      language,
      survey_type,
      hash,
      question_count: questions.length,
      created_by: user!.id,
    })
    .select("id, version, blueprint_version, language, survey_type, question_count, hash, created_at")
    .single();

  if (snapError) {
    return errorResponse("INTERNAL_ERROR", snapError.message, 500);
  }

  // Insert all questions
  const questionRows = questions.map((q) => ({
    catalog_snapshot_id: snapshot.id,
    frage_id: q.frage_id,
    block: q.block,
    ebene: q.ebene,
    unterbereich: q.unterbereich,
    fragetext: q.fragetext,
    owner_dependency: q.owner_dependency,
    deal_blocker: q.deal_blocker,
    sop_trigger: q.sop_trigger,
    ko_hart: q.ko_hart,
    ko_soft: q.ko_soft,
    block_weight: q.block_weight,
    position: q.position,
  }));

  const { error: qError } = await adminClient!
    .from("questions")
    .insert(questionRows);

  if (qError) {
    // Rollback: delete snapshot (questions cascade)
    await adminClient!
      .from("question_catalog_snapshots")
      .delete()
      .eq("id", snapshot.id);
    return errorResponse("INTERNAL_ERROR", `Question insert failed: ${qError.message}`, 500);
  }

  // Log admin event (use user session so auth.uid() resolves)
  await supabase.rpc("log_admin_event", {
    p_event_type: "catalog_imported",
    p_payload: { version, blueprint_version, language, question_count: questions.length, hash },
  });

  return NextResponse.json({ snapshot }, { status: 201 });
}
