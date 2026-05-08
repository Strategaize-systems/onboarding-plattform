// SLC-079 MT-4 — Per-Tenant Methodik-Review-Liste.
// URL: /admin/tenants/[tenantId]/walkthroughs[?status=...]
// Auth: strategaize_admin (alle Tenants) + tenant_admin (nur eigener Tenant)

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listWalkthroughsForReview,
  type WalkthroughListStatus,
} from "@/lib/walkthrough/list-walkthroughs-for-review";
import { WalkthroughsTable } from "@/app/admin/walkthroughs/WalkthroughsTable";

interface PageProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ status?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUS = new Set<WalkthroughListStatus>([
  "pending_review",
  "approved",
  "rejected",
  "all",
]);

export default async function ProTenantWalkthroughsPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantId } = await params;
  const { status: statusParam } = await searchParams;

  if (!tenantId || !UUID_RE.test(tenantId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/dashboard");
  const role = profile.role as string;
  if (role !== "strategaize_admin" && role !== "tenant_admin") {
    redirect("/dashboard");
  }
  if (role === "tenant_admin" && profile.tenant_id !== tenantId) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const { data: tenantRow } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantRow) notFound();

  const status: WalkthroughListStatus = VALID_STATUS.has(
    statusParam as WalkthroughListStatus,
  )
    ? (statusParam as WalkthroughListStatus)
    : "pending_review";

  const rows = await listWalkthroughsForReview(admin, { tenantId, status });

  const backHref =
    role === "strategaize_admin" ? "/admin/tenants" : "/dashboard";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {role === "strategaize_admin" ? "Alle Tenants" : "Dashboard"}
        </Link>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Walkthrough Methodik-Review — {tenantRow.name as string}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Walkthrough-Sessions dieses Tenants. Status-Filter aendert die Sicht.
        </p>
      </div>

      <StatusTabs
        current={status}
        basePath={`/admin/tenants/${tenantId}/walkthroughs`}
      />

      <div className="text-xs text-slate-500">
        <span className="font-semibold text-slate-900">{rows.length}</span>{" "}
        {status === "pending_review"
          ? "pendend"
          : status === "approved"
            ? "approved"
            : status === "rejected"
              ? "rejected"
              : "gesamt"}
      </div>

      <WalkthroughsTable
        rows={rows}
        showTenantColumn={false}
        emptyTitle={
          status === "pending_review"
            ? "Aktuell keine pendenden Walkthroughs"
            : "Keine Walkthroughs in dieser Sicht"
        }
        emptySubtitle="Sobald die Auto-Mapping-Pipeline einen Walkthrough fertigstellt, taucht er hier auf."
      />
    </div>
  );
}

function StatusTabs({
  current,
  basePath,
}: {
  current: WalkthroughListStatus;
  basePath: string;
}) {
  const items: Array<{ key: WalkthroughListStatus; label: string }> = [
    { key: "pending_review", label: "Pending Review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "Alle" },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {items.map((item) => {
        const href =
          item.key === "pending_review"
            ? basePath
            : `${basePath}?status=${item.key}`;
        const active = current === item.key;
        return (
          <Link
            key={item.key}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-primary text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
