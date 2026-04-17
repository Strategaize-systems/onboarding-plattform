import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { QuestionnaireWorkspace } from "./questionnaire-form";

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

  const template = await getTemplateById(supabase, session.template_id);

  if (!template) {
    notFound();
  }

  const block = template.blocks.find((b) => b.key === blockKey);

  if (!block) {
    notFound();
  }

  const locale = await getLocale();

  return (
    <QuestionnaireWorkspace
      sessionId={sessionId}
      activeBlockKey={blockKey}
      templateName={template.name}
      blocks={template.blocks}
      savedAnswers={session.answers}
      locale={locale}
    />
  );
}
