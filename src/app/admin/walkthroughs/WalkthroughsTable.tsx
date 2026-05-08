// SLC-079 MT-4 — Tabelle der Walkthrough-Sessions in den Methodik-Review-Routen.
// Wird von /admin/walkthroughs (Cross-Tenant) und /admin/tenants/[id]/walkthroughs (Per-Tenant)
// wiederverwendet. Server Component (kein Client-State).

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { WalkthroughListRow } from "@/lib/walkthrough/list-walkthroughs-for-review";

interface Props {
  rows: WalkthroughListRow[];
  showTenantColumn: boolean;
  emptyTitle: string;
  emptySubtitle: string;
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-slate-200 text-slate-700",
};

export function WalkthroughsTable({
  rows,
  showTenantColumn,
  emptyTitle,
  emptySubtitle,
}: Props) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
        data-testid="walkthroughs-empty"
      >
        <h3 className="text-base font-semibold text-slate-900">{emptyTitle}</h3>
        <p className="mt-2 text-sm text-slate-500">{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="walkthroughs-table"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {showTenantColumn && (
                <th className="px-4 py-3 text-left">Tenant</th>
              )}
              <th className="px-4 py-3 text-left">Aufgenommen von</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Mapped</th>
              <th className="px-4 py-3 text-right">Unmapped</th>
              <th className="px-4 py-3 text-left">Erstellt</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row) => {
              const reviewHref = `/admin/walkthroughs/${row.id}`;
              const status = row.status;
              const styleClass =
                STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  {showTenantColumn && (
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.tenantName}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-700">
                    {row.recordedByEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styleClass}`}
                    >
                      {STATUS_LABEL[status] ?? status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {row.mappedCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {row.unmappedCount > 0 ? (
                      <span className="font-semibold text-red-700">
                        {row.unmappedCount}
                      </span>
                    ) : (
                      row.unmappedCount
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <Link
                        href={reviewHref}
                        className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-primary-dark"
                        data-testid="walkthrough-action"
                      >
                        Pruefen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
