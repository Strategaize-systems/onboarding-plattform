import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/capture/[sessionId]/evidence/list?blockKey=X
 * Returns evidence files + document analyses for a block.
 * Runs server-side to avoid browser Supabase URL issues.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;
  const blockKey = new URL(request.url).searchParams.get("blockKey");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // --- Session ownership check (gespiegelt aus upload/route.ts; DEC-280 / ISSUE-124
  //     Cross-Tenant-IDOR) — VOR dem admin-Read der evidence-Daten. ---
  const { data: session } = await adminClient
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  // strategaize_admin hat Cross-Tenant-Zugriff; andere muessen den Tenant matchen.
  if (
    profile.role !== "strategaize_admin" &&
    session.tenant_id !== profile.tenant_id
  ) {
    return NextResponse.json(
      { error: "Kein Zugriff auf diese Session" },
      { status: 403 }
    );
  }

  // Load evidence files
  let fileQuery = adminClient
    .from("evidence_file")
    .select("id, original_filename, mime_type, file_size_bytes, extraction_status, extraction_error, created_at")
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

  if (blockKey) {
    fileQuery = fileQuery.eq("block_key", blockKey);
  }

  const { data: files } = await fileQuery;

  // Load document_analysis events
  let eventQuery = adminClient
    .from("capture_events")
    .select("payload, created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "document_analysis")
    .order("created_at", { ascending: false });

  if (blockKey) {
    eventQuery = eventQuery.eq("block_key", blockKey);
  }

  const { data: events } = await eventQuery;

  // Map analyses by evidence_file_id
  const analyses: Record<string, { text: string; created_at: string }> = {};
  for (const event of events ?? []) {
    const payload = event.payload as Record<string, unknown>;
    const fileId = payload?.evidence_file_id as string;
    if (fileId && payload?.text && !analyses[fileId]) {
      analyses[fileId] = {
        text: payload.text as string,
        created_at: event.created_at,
      };
    }
  }

  return NextResponse.json({ files: files ?? [], analyses });
}
