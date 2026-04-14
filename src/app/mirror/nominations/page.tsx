import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NominationsClient } from "./nominations-client";

export default async function NominationsPage() {
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

  if (!profile || profile.role !== "tenant_admin") {
    redirect("/dashboard");
  }

  return <NominationsClient tenantId={profile.tenant_id!} profile={profile} />;
}
