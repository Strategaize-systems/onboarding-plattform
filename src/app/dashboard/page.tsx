import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Admin users go to the admin dashboard
  if (profile.role === "strategaize_admin") {
    redirect("/admin");
  }

  // Load sessions server-side (internal Supabase URL works here)
  const { data: sessionsData } = await supabase
    .from("capture_session")
    .select("id, status, started_at, updated_at, capture_mode, template:template_id(name, slug)")
    .order("updated_at", { ascending: false });

  const sessions = (sessionsData ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as string,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    capture_mode: (row as Record<string, unknown>).capture_mode as string | null,
    template: (Array.isArray(row.template) ? row.template[0] ?? null : row.template) as { name: string; slug: string } | null,
  }));

  // Load pending gap question counts
  const { data: pendingGaps } = await supabase
    .from("gap_question")
    .select("capture_session_id")
    .eq("status", "pending");

  const gapCounts: Record<string, number> = {};
  if (pendingGaps) {
    for (const g of pendingGaps) {
      gapCounts[g.capture_session_id] = (gapCounts[g.capture_session_id] ?? 0) + 1;
    }
  }

  return <DashboardClient profile={profile} initialSessions={sessions} initialGapCounts={gapCounts} />;
}
