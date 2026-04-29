// SLC-043 MT-1+MT-2 — Tabelle der pendenden Reviews. Wird von /admin/reviews
// (Cross-Tenant) und /admin/tenants/[id]/reviews (Pro-Tenant) wiederverwendet.
// Server-Component (kein Client-State noetig), nimmt schon-formatierte Rows.
//
// Spalten: Tenant (optional, wenn `showTenantColumn`), Block, KU-Count,
// Letzter Submit, Aktion. Action-Link zu SLC-042 Konsolidierter Review-View
// `/admin/blocks/[blockKey]/review?tenant=...&session=...`.

import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";

import type { PendingReviewRow } from "@/lib/reviews/list-pending-reviews";

interface PendingReviewsTableProps {
  rows: PendingReviewRow[];
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

export function PendingReviewsTable({
  rows,
  showTenantColumn,
  emptyTitle,
  emptySubtitle,
}: PendingReviewsTableProps) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
        data-testid="pending-reviews-empty"
      >
        <h3 className="text-base font-semibold text-slate-900">{emptyTitle}</h3>
        <p className="mt-2 text-sm text-slate-500">{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="pending-reviews-table"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {showTenantColumn && (
                <th className="px-4 py-3 text-left">Tenant</th>
              )}
              <th className="px-4 py-3 text-left">Block</th>
              <th className="px-4 py-3 text-right">KUs</th>
              <th className="px-4 py-3 text-left">Letzter Submit</th>
              <th className="px-4 py-3 text-left">Erstellt</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row) => {
              const reviewHref = `/admin/blocks/${row.blockKey}/review?tenant=${row.tenantId}&session=${row.captureSessionId}`;
              const debriefHref = `/admin/debrief/${row.captureSessionId}/${row.blockKey}`;
              return (
                <tr
                  key={`${row.tenantId}-${row.captureSessionId}-${row.blockKey}`}
                  className="hover:bg-slate-50"
                >
                  {showTenantColumn && (
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.tenantName}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                      {row.blockKey}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {row.knowledgeUnitCount}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(row.lastSubmittedAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={reviewHref}
                        className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-primary-dark"
                        data-testid="pending-review-action"
                      >
                        Pruefen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={debriefHref}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        title="Im Debrief bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
