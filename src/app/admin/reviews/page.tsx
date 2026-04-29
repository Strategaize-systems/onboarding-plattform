// SLC-043 MT-1 — Cross-Tenant Reviews-Page fuer den Berater (strategaize_admin).
// URL: /admin/reviews. Listet alle pendenden block_review-Rows ueber alle
// Tenants, oldest-first, mit Action-Link zur SLC-042-Konsolidierter-Review-View.
//
// Auth: zwar bereits durch /admin/layout auf strategaize_admin oder
// tenant_admin gegated, aber dieses Page-Level explizit auf strategaize_admin —
// tenant_admin sieht hier nichts (gemaess Slice AC-2).

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingReviews } from "@/lib/reviews/list-pending-reviews";
import { PendingReviewsTable } from "./PendingReviewsTable";

export default async function CrossTenantReviewsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  const adminClient = createAdminClient();
  const rows = await listPendingReviews(adminClient);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Pending Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">
          Alle Mitarbeiter-Bloecke ueber alle Tenants, die auf Berater-Pruefung warten.
          Sortiert nach Eintreff-Reihenfolge (aelteste zuerst).
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-900">{rows.length}</span> pendend
        </span>
        {rows.length > 0 && (
          <span>
            ueber{" "}
            <span className="font-semibold text-slate-900">
              {new Set(rows.map((r) => r.tenantId)).size}
            </span>{" "}
            Tenants
          </span>
        )}
      </div>

      <PendingReviewsTable
        rows={rows}
        showTenantColumn
        emptyTitle="Aktuell keine pendenden Reviews"
        emptySubtitle="Alle Mitarbeiter-Bloecke sind aktuell entweder approved oder rejected."
      />
    </div>
  );
}
