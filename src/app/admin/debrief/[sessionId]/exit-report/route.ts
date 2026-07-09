// V10.5 SLC-191 MT-5 — Bereitstellung des Exit-/Devil's-Advocate-Reports als PDF.
//
// GET /admin/debrief/[sessionId]/exit-report → application/pdf.
// Spiegel der Fahrplan-Route (fahrplan-report/route.ts, DEC-272) + berater-Zweig
// (DEC-276, V10.4-Konsistenz). Auth: authentifiziert + (strategaize_admin cross-tenant
// ODER eigener Tenant ODER strategaize_berater mit Tenant-Zuweisung).
// Tier-READ-Gate (blueprint+, Matrix-Single-Source fn_tier_rank, fail-closed) — der
// Report ist wie der Fahrplan ein Blueprint-Deliverable.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadExitReportInput, renderExitReportPdf } from "@/lib/pdf/exit-report";

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

  // 3. Tenant-Scope: strategaize_admin cross-tenant, eigener Tenant, ODER berater
  //    mit Zuweisung (berater_assigned_tenant_ids = MIG-132 SECURITY-DEFINER-RPC,
  //    zugewiesene ∪ Cascade; fail-closed bei kein Ergebnis — vgl. workspace-scope.ts).
  let allowed =
    profile.role === "strategaize_admin" || session.tenant_id === profile.tenant_id;
  if (!allowed && profile.role === "strategaize_berater") {
    const { data: ids } = await admin.rpc("berater_assigned_tenant_ids", {
      p_uid: user.id,
    });
    allowed = Array.isArray(ids) && (ids as string[]).includes(session.tenant_id);
  }
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 4. Tier-READ-Gate: blueprint+ (Matrix-Rang via fn_tier_rank, fail-closed).
  const { data: rank } = await admin.rpc("fn_tier_rank", { p_tier: session.tier ?? "" });
  if (typeof rank !== "number" || rank < BLUEPRINT_RANK) {
    return NextResponse.json(
      { error: "tier_gate_denied", message: "Der Exit-Report ist ab Stufe Blueprint verfügbar." },
      { status: 403 },
    );
  }

  // 5. Laden + Rendern + Ausliefern
  const input = await loadExitReportInput(admin, sessionId);
  const pdf = await renderExitReportPdf(input);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="exit-report-${sessionId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
