import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/capture/[sessionId]/evidence/[fileId]/download
 * Generate a signed download URL for an evidence file.
 * Ported from Blueprint evidence/[evidenceId]/download/route.ts
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; fileId: string }> }
) {
  const supabase = await createClient();
  const { sessionId, fileId } = await params;

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

  const adminClient = createAdminClient();

  // --- Session ownership check (gespiegelt aus upload/route.ts; DEC-280) — expliziter
  //     tenant-Match statt implizitem RLS-Load, konsistent mit list + upload. ---
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

  // strategaize_admin hat Cross-Tenant-Zugriff; andere muessen den Tenant matchen.
  if (
    profile.role !== "strategaize_admin" &&
    session.tenant_id !== profile.tenant_id
  ) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Kein Zugriff auf diese Session" } },
      { status: 403 }
    );
  }

  // Load evidence file
  const { data: file } = await adminClient
    .from("evidence_file")
    .select("id, storage_path, original_filename, capture_session_id")
    .eq("id", fileId)
    .eq("capture_session_id", sessionId)
    .single();

  if (!file) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Datei nicht gefunden" } },
      { status: 404 }
    );
  }

  // Generate signed URL (15 min expiry)
  const { data: signedUrl, error } = await adminClient.storage
    .from("evidence")
    .createSignedUrl(file.storage_path, 900);

  if (error || !signedUrl) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Download-URL konnte nicht erstellt werden" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    download_url: signedUrl.signedUrl,
    file_name: file.original_filename,
    expires_in: 900,
  });
}
