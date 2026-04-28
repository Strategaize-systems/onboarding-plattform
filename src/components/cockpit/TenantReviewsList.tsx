// SLC-042 MT-5 — Read-only Liste der Berater-Review-Status pro Block fuer
// den eigenen Tenant. tenant_admin sieht nur den eigenen Tenant via RLS-Policy
// block_review_tenant_admin_select.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface TenantReviewRow {
  block_key: string;
  block_title: string;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  note: string | null;
}

interface Props {
  rows: TenantReviewRow[];
}

const STATUS_LABEL: Record<TenantReviewRow["status"], string> = {
  pending: "Ausstehend",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<TenantReviewRow["status"], string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  approved: "bg-green-100 text-green-900 border-green-300",
  rejected: "bg-red-100 text-red-900 border-red-300",
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export function TenantReviewsList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-slate-600">
          Es liegen noch keine Berater-Reviews fuer Mitarbeiter-Bloecke vor.
          Sobald Mitarbeiter erste Beitraege einreichen, erscheinen hier die
          Status-Eintraege.
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.block_key}>
          <Card className="border-slate-200">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium text-slate-900">
                  {row.block_title}
                </h3>
                <p className="text-xs text-slate-500">
                  Block {row.block_key}
                  {row.reviewed_at && (
                    <>
                      {" · "}
                      reviewed{" "}
                      {dateFormatter.format(new Date(row.reviewed_at))}
                    </>
                  )}
                </p>
                {row.note && (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                    {row.note}
                  </p>
                )}
              </div>
              <Badge variant="outline" className={STATUS_TONE[row.status]}>
                {STATUS_LABEL[row.status]}
              </Badge>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
