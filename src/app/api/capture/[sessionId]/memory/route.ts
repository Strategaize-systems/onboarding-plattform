import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/capture/[sessionId]/memory
 * Returns the session memory for a capture session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const { sessionId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  // Verify session ownership via profile tenant
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 403 });
  }

  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  // Read memory via admin client (RLS SELECT is allowed, but admin is simpler)
  const adminClient = createAdminClient();
  const { data: memoryData } = await adminClient
    .from("session_memory")
    .select("memory_text, version, updated_at")
    .eq("session_id", sessionId)
    .single();

  return NextResponse.json({
    memory: memoryData
      ? {
          text: memoryData.memory_text,
          version: memoryData.version,
          updatedAt: memoryData.updated_at,
        }
      : null,
  });
}
