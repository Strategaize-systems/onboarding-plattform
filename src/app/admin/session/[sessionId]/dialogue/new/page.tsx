import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CreateDialogueForm } from "@/components/dialogue/create-dialogue-form";

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function NewDialoguePage({ params }: Props) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["tenant_admin", "strategaize_admin"].includes(profile.role)) {
    redirect("/");
  }

  // Load capture session
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id")
    .eq("id", sessionId)
    .single();

  if (!session) redirect("/admin");

  // Load tenant members for participant selection
  // Also include strategaize_admin (no tenant_id) so they can join as participant
  const adminClient = createAdminClient();
  const { data: tenantMembers } = await adminClient
    .from("profiles")
    .select("id, email, role")
    .eq("tenant_id", session.tenant_id)
    .order("email");

  const { data: adminMembers } = await adminClient
    .from("profiles")
    .select("id, email, role")
    .eq("role", "strategaize_admin")
    .order("email");

  // Merge: tenant members first, then admins (deduplicated)
  const tenantIds = new Set((tenantMembers ?? []).map((m) => m.id));
  const members = [
    ...(tenantMembers ?? []),
    ...(adminMembers ?? []).filter((m) => !tenantIds.has(m.id)),
  ];

  // Load meeting guide if exists
  const { data: meetingGuide } = await supabase
    .from("meeting_guide")
    .select("id, goal, topics")
    .eq("capture_session_id", sessionId)
    .maybeSingle();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dialogue-Session erstellen</h1>
        <p className="mt-1 text-sm text-slate-500">
          Session {sessionId.substring(0, 8)}
        </p>
      </div>

      <CreateDialogueForm
        sessionId={sessionId}
        currentUserId={user.id}
        members={members as Array<{ id: string; display_name: string | null; email: string; role: string }>}
        meetingGuide={meetingGuide as { id: string; goal: string | null; topics: unknown[] } | null}
      />
    </div>
  );
}
