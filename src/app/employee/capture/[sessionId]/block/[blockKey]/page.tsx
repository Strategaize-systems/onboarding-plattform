import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { EmployeeQuestionnaireMode } from "@/components/capture-modes/employee-questionnaire/EmployeeQuestionnaireMode";

/**
 * SLC-037 MT-2 — Mitarbeiter-Block-Detail-Page.
 *
 * Sichtperimeter (R16):
 *   - owner_user_id = auth.uid()  (defensive Application-Check zusaetzlich zu RLS)
 *   - capture_mode = 'employee_questionnaire'
 *
 * Delegiert das eigentliche UI an `EmployeeQuestionnaireMode` (Wrapper um
 * QuestionnaireWorkspace mit basePath='/employee/capture'). Layout-Chrome
 * wird von /employee/layout.tsx fuer non-fullscreen-Routen geliefert; diese
 * Route nutzt den eigenen Workspace-Fullscreen-Modus.
 */
export default async function EmployeeBlockDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string; blockKey: string }>;
}) {
  const { sessionId, blockKey } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "employee") {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);

  if (!session) {
    notFound();
  }

  const owner = (session as { owner_user_id?: string }).owner_user_id;
  if (owner !== user.id) {
    notFound();
  }

  const captureMode = (session as { capture_mode?: string | null }).capture_mode;
  if (captureMode !== "employee_questionnaire") {
    notFound();
  }

  const template = await getTemplateById(supabase, session.template_id);

  if (!template) {
    notFound();
  }

  const block = template.blocks.find((b) => b.key === blockKey);

  if (!block) {
    notFound();
  }

  const locale = await getLocale();

  const { data: blockCheckpoints } = await supabase
    .from("block_checkpoint")
    .select("id, checkpoint_type, content_hash, created_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false });

  return (
    <EmployeeQuestionnaireMode
      sessionId={sessionId}
      activeBlockKey={blockKey}
      templateName={template.name}
      blocks={template.blocks}
      ownerFields={template.owner_fields ?? []}
      savedAnswers={session.answers}
      locale={locale}
      existingCheckpoints={blockCheckpoints ?? []}
    />
  );
}
