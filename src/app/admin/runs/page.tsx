import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RunsClient } from "./runs-client";

export default async function AdminRunsPage() {
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

  return <RunsClient email={profile?.email ?? ""} />;
}
