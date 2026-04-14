import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileFormClient } from "./profile-form-client";

export default async function ProfilePage() {
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

  if (!profile || profile.role === "strategaize_admin") {
    redirect("/login");
  }

  // Load existing owner profile if any
  // Uses adminClient because authenticated role may lack table-level GRANT on owner_profiles
  const adminClient = createAdminClient();
  const { data: ownerProfile } = await adminClient
    .from("owner_profiles")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .single();

  return <ProfileFormClient profile={profile} ownerProfile={ownerProfile} />;
}
