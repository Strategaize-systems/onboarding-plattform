import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCrossTenantCockpit } from "@/lib/cockpit/load-cross-tenant";
import { TenantsClient } from "./tenants-client";
import { CrossTenantCockpit } from "./CrossTenantCockpit";

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

  // SLC-040 MT-6 — Cross-Tenant-Cockpit-Daten via service_role-Client (RLS-Bypass).
  // Die Tabelle aggregiert pro Tenant: blocks-Progress, Mitarbeiter-Count,
  // Bridge-Status, Handbuch-Status. Wenn die Aggregation fehlschlaegt, faellt
  // der Render auf die Tenants-Liste ohne Cockpit zurueck — nicht-blockierend.
  let cockpitRows: Awaited<ReturnType<typeof loadCrossTenantCockpit>> = [];
  try {
    const adminClient = createAdminClient();
    cockpitRows = await loadCrossTenantCockpit(adminClient);
  } catch (err) {
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "admin/tenants/loadCrossTenantCockpit" });
  }

  return (
    <div>
      <CrossTenantCockpit rows={cockpitRows} />
      <TenantsClient email={profile.email ?? ""} />
    </div>
  );
}
