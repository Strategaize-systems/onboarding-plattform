import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MirrorProfileClient } from "./mirror-profile-client";

export default async function MirrorProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role, respondent_layer")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "mirror_respondent") {
    redirect("/login");
  }

  // Load existing mirror profile if any
  const adminClient = createAdminClient();
  const { data: mirrorProfile } = await adminClient
    .from("mirror_profiles")
    .select("*")
    .eq("profile_id", user.id)
    .single();

  return (
    <MirrorProfileClient
      profile={profile}
      mirrorProfile={mirrorProfile}
      respondentLayer={profile.respondent_layer ?? "key_staff"}
    />
  );
}
