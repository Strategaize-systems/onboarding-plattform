import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CatalogClient } from "./catalog-client";

export default async function AdminCatalogPage() {
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

  return <CatalogClient email={profile?.email ?? ""} />;
}
