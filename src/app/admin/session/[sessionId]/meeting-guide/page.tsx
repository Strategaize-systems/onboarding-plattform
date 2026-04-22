import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { MeetingGuideEditor } from "./meeting-guide-editor";

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function MeetingGuidePage({ params }: Props) {
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

  // Load capture session (RLS filtered)
  const { data: session } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id, answers")
    .eq("id", sessionId)
    .single();

  if (!session) redirect("/admin");

  // Load template (admin client for full access)
  const adminClient = createAdminClient();
  const { data: template } = await adminClient
    .from("template")
    .select("id, name, slug, blocks, version")
    .eq("id", session.template_id)
    .single();

  if (!template) redirect("/admin");

  // Load existing meeting guide (may not exist yet)
  const { data: meetingGuide } = await supabase
    .from("meeting_guide")
    .select("*")
    .eq("capture_session_id", sessionId)
    .maybeSingle();

  const blocks = (template.blocks as Array<{ key: string; title: string }>) || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Meeting-Guide</h1>
        <p className="mt-1 text-sm text-slate-500">
          {template.name} — Session {sessionId.substring(0, 8)}
        </p>
      </div>

      <MeetingGuideEditor
        sessionId={sessionId}
        templateBlocks={blocks}
        initialGuide={meetingGuide}
      />
    </div>
  );
}
