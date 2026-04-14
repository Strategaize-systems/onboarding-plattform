import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";

// GET /api/tenant/runs — List all runs for the authenticated tenant
export async function GET() {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { profile, supabase } = auth;

  // RLS ensures only own tenant's runs are returned
  const { data: runs, error } = await supabase
    .from("runs")
    .select(
      `
      id, title, description, status, due_date, created_at, submitted_at,
      question_catalog_snapshots!inner(question_count)
    `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  // Enrich with answered_count and evidence_count
  const enriched = await Promise.all(
    (runs ?? []).map(async (r) => {
      const catalogData = r.question_catalog_snapshots as unknown as {
        question_count: number;
      };

      const { count: answeredCount } = await supabase
        .from("v_current_answers")
        .select("question_id", { count: "exact", head: true })
        .eq("run_id", r.id);

      const { count: evidenceCount } = await supabase
        .from("evidence_items")
        .select("id", { count: "exact", head: true })
        .eq("run_id", r.id);

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        due_date: (r as Record<string, unknown>).due_date ?? null,
        question_count: catalogData?.question_count ?? 0,
        answered_count: answeredCount ?? 0,
        evidence_count: evidenceCount ?? 0,
        created_at: r.created_at,
        submitted_at: r.submitted_at,
      };
    })
  );

  return NextResponse.json({ runs: enriched });
}
