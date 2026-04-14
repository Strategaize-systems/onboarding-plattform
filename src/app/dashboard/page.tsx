import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Admin users go to the admin dashboard
  if (profile.role === "strategaize_admin") {
    redirect("/admin");
  }

  // Mirror respondents: check policy → check mirror profile → dashboard
  if (profile.role === "mirror_respondent") {
    const adminClient = createAdminClient();
    const { data: policyConfirmation } = await adminClient
      .from("mirror_policy_confirmations")
      .select("confirmed_at")
      .eq("profile_id", user.id)
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (!policyConfirmation) {
      redirect("/mirror/policy");
    }

    // Check if mirror profile exists — redirect to profile form if not
    const { data: mirrorProfile } = await adminClient
      .from("mirror_profiles")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!mirrorProfile) {
      redirect("/mirror/profile");
    }

    return <DashboardClient profile={profile} />;
  }

  // Check if owner profile exists — redirect to profile form if not
  // Uses adminClient because authenticated role may lack table-level GRANT
  const adminClient = createAdminClient();
  const { data: ownerProfile } = await adminClient
    .from("owner_profiles")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (!ownerProfile) {
    redirect("/profile");
  }

  return <DashboardClient profile={profile} />;
}
