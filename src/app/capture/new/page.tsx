import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/db/template-queries";
import { StartSessionClient } from "./start-session-client";

export default async function CaptureNewPage() {
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

  if (!profile || profile.role !== "tenant_admin") {
    redirect("/dashboard");
  }

  const templates = await listTemplates(supabase);

  return <StartSessionClient templates={templates} />;
}
