import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCrossTenantCockpit } from "@/lib/cockpit/load-cross-tenant";
import { pendingCountsByTenant } from "@/lib/reviews/pending-counts-by-tenant";
import { countPendingWalkthroughsByTenant } from "@/lib/walkthrough/list-walkthroughs-for-review";
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
  // SLC-043 MT-3 — Pending-Reviews-Counts pro Tenant fuer den Quick-Stats-Badge.
  let pendingByTenant: Record<string, number> = {};
  // SLC-079 MT-6 — Pending-Walkthroughs-Counts pro Tenant.
  let pendingWalkthroughsByTenant: Record<string, number> = {};
  try {
    const adminClient = createAdminClient();
    const [cockpit, pending, pendingWalkthroughs] = await Promise.all([
      loadCrossTenantCockpit(adminClient),
      pendingCountsByTenant(adminClient).catch(() => new Map<string, number>()),
      countPendingWalkthroughsByTenant(adminClient).catch(
        () => new Map<string, number>(),
      ),
    ]);
    cockpitRows = cockpit;
    pendingByTenant = Object.fromEntries(pending.entries());
    pendingWalkthroughsByTenant = Object.fromEntries(
      pendingWalkthroughs.entries(),
    );
  } catch (err) {
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "admin/tenants/loadCrossTenantCockpit" });
  }

  return (
    <div>
      <CrossTenantCockpit rows={cockpitRows} />
      <TenantsClient
        email={profile.email ?? ""}
        pendingReviewsByTenant={pendingByTenant}
        pendingWalkthroughsByTenant={pendingWalkthroughsByTenant}
      />
    </div>
  );
}
