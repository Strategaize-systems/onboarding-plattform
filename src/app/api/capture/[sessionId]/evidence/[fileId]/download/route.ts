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

  // --- Zugriffs-Gate via RLS (ISSUE-124 Cross-Tenant-IDOR): der user-scoped Client
  //     sieht die capture_session nur bei erlaubtem Zugriff (eigener Tenant,
  //     partner-admin-via-mapping, berater, strategaize_admin — RLS auf
  //     capture_session). Kein Treffer => kein Zugriff (404 vermeidet
  //     Existenz-Enumeration). Der admin-Client (BYPASSRLS) wird erst NACH dem Gate
  //     fuer den evidence-Read + Signed-URL genutzt. Bewusst KEIN starrer
  //     tenant_id-Vergleich — RLS deckt auch den legitimen partner-mapping-/berater-
  //     Lesezugriff, den ein tenant_id-Gleichheitscheck faelschlich sperren wuerde
  //     (Review V20). ---
  const { data: session } = await supabase
    .from("capture_session")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Session nicht gefunden oder kein Zugriff" } },
      { status: 404 }
    );
  }

  const adminClient = createAdminClient();

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
