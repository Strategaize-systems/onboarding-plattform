// SLC-079 MT-4 — Cross-Tenant Methodik-Review-Liste fuer strategaize_admin.
// URL: /admin/walkthroughs[?status=pending_review|approved|rejected|all]

import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listWalkthroughsForReview,
  type WalkthroughListStatus,
} from "@/lib/walkthrough/list-walkthroughs-for-review";
import { WalkthroughsTable } from "./WalkthroughsTable";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const VALID_STATUS = new Set<WalkthroughListStatus>([
  "pending_review",
  "approved",
  "rejected",
  "all",
]);

export default async function CrossTenantWalkthroughsPage({
  searchParams,
}: PageProps) {
  const { status: statusParam } = await searchParams;

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

  const status: WalkthroughListStatus = VALID_STATUS.has(
    statusParam as WalkthroughListStatus,
  )
    ? (statusParam as WalkthroughListStatus)
    : "pending_review";

  const admin = createAdminClient();
  const rows = await listWalkthroughsForReview(admin, { status });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Walkthrough Methodik-Review
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Walkthrough-Sessions ueber alle Tenants. Status-Filter aendert die
          Sicht.
        </p>
      </div>

      <StatusTabs current={status} basePath="/admin/walkthroughs" />

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-900">{rows.length}</span>{" "}
          {status === "pending_review"
            ? "pendend"
            : status === "approved"
              ? "approved"
              : status === "rejected"
                ? "rejected"
                : "gesamt"}
        </span>
        {rows.length > 0 && status !== "all" && (
          <span>
            ueber{" "}
            <span className="font-semibold text-slate-900">
              {new Set(rows.map((r) => r.tenantId)).size}
            </span>{" "}
            Tenants
          </span>
        )}
      </div>

      <WalkthroughsTable
        rows={rows}
        showTenantColumn
        emptyTitle={
          status === "pending_review"
            ? "Aktuell keine pendenden Walkthroughs"
            : "Keine Walkthroughs in dieser Sicht"
        }
        emptySubtitle={
          status === "pending_review"
            ? "Sobald die Auto-Mapping-Pipeline einen Walkthrough fertigstellt, taucht er hier auf."
            : "Wechsle die Status-Filter oben, um andere Sichten zu zeigen."
        }
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
