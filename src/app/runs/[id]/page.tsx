import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RunWorkspaceClient } from "./run-workspace-client";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Admin users should use the admin run detail page
  if (profile.role === "strategaize_admin") {
    redirect(`/admin/runs/${runId}`);
  }

  return <RunWorkspaceClient runId={runId} isAdmin={false} isMirrorRespondent={profile.role === "mirror_respondent"} />;
}
