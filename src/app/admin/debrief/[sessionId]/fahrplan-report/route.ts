// V9.75 SLC-V9.75-B MT-4 — Bereitstellung des Stufe-1 Fahrplan-Reports als PDF.
//
// GET /admin/debrief/[sessionId]/fahrplan-report → application/pdf.
// Auth: authentifiziert + (strategaize_admin ODER tenant_admin der Session-Tenant).
// V9.75 Tier-READ-Gate (AC-B-4): der Stufe-1-Report ist ein blueprint-Deliverable
// → nur blueprint+ darf rendern (free abgelehnt, 403). Ordnung kommt aus der
// Matrix-Single-Source fn_tier_rank (blueprint = Rang 1), kein hartkodierter Vergleich.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFahrplanInput, renderFahrplanReportPdf } from "@/lib/pdf/fahrplan-report";

const BLUEPRINT_RANK = 1; // fn_tier_rank('blueprint') — Stufe-1-Mindestrang.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 2. Session laden (Tenant + tier)
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("capture_session")
    .select("tenant_id, tier")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 3. Tenant-Scope (strategaize_admin cross-tenant)
  if (profile.role !== "strategaize_admin" && session.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 4. V9.75 Tier-READ-Gate: blueprint+ (Matrix-Rang via fn_tier_rank, fail-closed).
  const { data: rank } = await admin.rpc("fn_tier_rank", { p_tier: session.tier ?? "" });
  if (typeof rank !== "number" || rank < BLUEPRINT_RANK) {
    return NextResponse.json(
      { error: "tier_gate_denied", message: "Der Fahrplan-Report ist ab Stufe Blueprint verfügbar." },
      { status: 403 },
    );
  }

  // 5. Laden + Rendern + Ausliefern
  const input = await loadFahrplanInput(admin, sessionId);
  const pdf = await renderFahrplanReportPdf(input);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fahrplan-${sessionId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
