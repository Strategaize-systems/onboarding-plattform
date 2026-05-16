// V6.3 SLC-105 MT-7 — Diagnose-Status-Endpoint fuer Bericht-pending-Polling.
//
// GET /api/diagnose/[capture_session_id]/status
//
// Auth: Tenant-Match auf capture_session via User-Context-Client (RLS).
// Returns: { status: 'open'|'in_progress'|'submitted'|'reviewed'|'finalized'|'failed' }.
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 5 (Polling-Endpoint).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ capture_session_id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { capture_session_id: sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "no_profile" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("capture_session")
    .select("id, tenant_id, status")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ status: session.status }, { status: 200 });
}
