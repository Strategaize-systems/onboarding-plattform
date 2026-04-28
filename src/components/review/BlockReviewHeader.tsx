// SLC-042 MT-1 — Header der konsolidierten Review-Page mit Tenant-Name,
// Block-Titel, Status-Badge und KU-Count.

import { Badge } from "@/components/ui/badge";

type ReviewStatus = "pending" | "approved" | "rejected";

interface Props {
  tenantName: string;
  blockTitle: string;
  blockKey: string;
  kuCount: number;
  status: ReviewStatus;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Ausstehend",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  approved: "bg-green-100 text-green-900 border-green-300",
  rejected: "bg-red-100 text-red-900 border-red-300",
};

export function BlockReviewHeader({
  tenantName,
  blockTitle,
  blockKey,
  kuCount,
  status,
}: Props) {
  return (
    <header className="space-y-2 border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{tenantName}</span>
        <span aria-hidden>·</span>
        <span>Block {blockKey}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{blockTitle}</h1>
        <Badge variant="outline" className={STATUS_TONE[status]}>
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <p className="text-sm text-slate-500">
        {kuCount === 1
          ? "1 Mitarbeiter-Beitrag in diesem Block"
          : `${kuCount} Mitarbeiter-Beitraege in diesem Block`}
      </p>
    </header>
  );
}
