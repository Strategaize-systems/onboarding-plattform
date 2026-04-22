import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TenantsClient } from "./tenants-client";

export default async function AdminTenantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  return <TenantsClient email={profile.email ?? ""} />;
}
