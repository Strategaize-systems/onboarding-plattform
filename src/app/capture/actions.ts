"use server";

import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import { createCaptureSession } from "@/lib/db/capture-session-queries";
import { redirect } from "next/navigation";

export async function startCaptureSession(templateSlug: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "tenant_admin") {
    return { error: "Nur tenant_admin kann Sessions starten" };
  }

  const template = await getTemplateBySlug(supabase, templateSlug);

  if (!template) {
    return { error: `Template '${templateSlug}' nicht gefunden` };
  }

  const session = await createCaptureSession(supabase, {
    tenant_id: profile.tenant_id,
    template_id: template.id,
    template_version: template.version,
    owner_user_id: user.id,
  });

  redirect(`/capture/${session.id}`);
}
