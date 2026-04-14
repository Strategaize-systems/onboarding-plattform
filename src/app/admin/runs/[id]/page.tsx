import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RunDetailClient } from "./run-detail-client";

export default async function AdminRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: runId } = await params;
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

  return <RunDetailClient runId={runId} email={profile?.email ?? ""} />;
}
