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
    .select("email")
    .eq("id", user.id)
    .single();

  return <TenantsClient email={profile?.email ?? ""} />;
}
