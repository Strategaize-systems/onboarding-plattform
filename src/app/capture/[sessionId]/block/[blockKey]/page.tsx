import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { QuestionnaireForm } from "./questionnaire-form";

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

  // Defense-in-depth: RLS handles cross-tenant isolation
  if (session.tenant_id !== profile.tenant_id) {
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

  // Build block title from locale-aware title field
  const blockTitle =
    typeof block.title === "object"
      ? (block.title as Record<string, string>)["de"] ??
        Object.values(block.title as Record<string, string>)[0] ??
        block.key
      : block.key;

  return (
    <QuestionnaireForm
      sessionId={sessionId}
      blockKey={blockKey}
      blockTitle={blockTitle}
      templateName={template.name}
      questions={block.questions}
      savedAnswers={session.answers}
      totalBlocks={template.blocks.length}
    />
  );
}
