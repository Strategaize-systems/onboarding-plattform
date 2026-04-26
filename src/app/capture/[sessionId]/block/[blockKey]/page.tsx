import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { QuestionnaireWorkspace } from "./questionnaire-form";
import { resolveCaptureMode } from "@/components/capture-modes/registry";

export default async function BlockDetailPage({
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

  if (!profile) {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);

  if (!session) {
    notFound();
  }

  if (session.tenant_id !== profile.tenant_id) {
    notFound();
  }

  // SLC-038 — Capture-Mode-Hook: Stub-Modes (z.B. walkthrough_stub) rendern
  // ihre eigene Komponente und ueberspringen den klassischen Block-Pfad.
  const { meta: modeMeta } = resolveCaptureMode(session.capture_mode);
  if (modeMeta.StubComponent) {
    const StubComponent = modeMeta.StubComponent;
    return <StubComponent />;
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

  // Load existing checkpoints for this block (for status display + submit guard)
  const { data: blockCheckpoints } = await supabase
    .from("block_checkpoint")
    .select("id, checkpoint_type, content_hash, created_at")
    .eq("capture_session_id", sessionId)
    .eq("block_key", blockKey)
    .order("created_at", { ascending: false });

  return (
    <QuestionnaireWorkspace
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
