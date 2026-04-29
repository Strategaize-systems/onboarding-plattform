// SLC-043 MT-2 — Pro-Tenant Reviews-Page fuer den Berater. URL:
// /admin/tenants/[tenantId]/reviews. Filter auf einen Tenant, Header zeigt
// Tenant-Name + Anzahl pendender Reviews + Link zurueck zur Tenants-Liste.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingReviews } from "@/lib/reviews/list-pending-reviews";
import { PendingReviewsTable } from "@/app/admin/reviews/PendingReviewsTable";

interface PageProps {
  params: Promise<{ tenantId: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProTenantReviewsPage({ params }: PageProps) {
  const { tenantId } = await params;

  if (!tenantId || !UUID_RE.test(tenantId)) notFound();

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

  const { data: tenantRow } = await adminClient
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenantRow) notFound();

  const rows = await listPendingReviews(adminClient, { tenantId });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Alle Tenants
        </Link>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Pending Reviews — {tenantRow.name as string}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Mitarbeiter-Bloecke dieses Tenants, die auf Berater-Pruefung warten.
          Sortiert nach Eintreff-Reihenfolge (aelteste zuerst).
        </p>
      </div>

      <div className="text-xs text-slate-500">
        <span className="font-semibold text-slate-900">{rows.length}</span> pendend
      </div>

      <PendingReviewsTable
        rows={rows}
        showTenantColumn={false}
        emptyTitle="Keine pendenden Reviews fuer diesen Tenant"
        emptySubtitle="Alle Mitarbeiter-Bloecke dieses Tenants sind aktuell entweder approved oder rejected."
      />
    </div>
  );
}
