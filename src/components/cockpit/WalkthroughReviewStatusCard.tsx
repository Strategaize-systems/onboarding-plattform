// V5 Option 2 Hotfix — Cockpit-Card "Walkthroughs zur Review".
//
// Pure Render-Komponente analog `BlockReviewStatusCard` fuer V4.1 block_review.
// Summary kommt aus `getWalkthroughReviewSummary` (server-side). Link variiert
// je nach Rolle:
//   - tenant_admin     -> /admin/tenants/[tenantId]/walkthroughs
//   - strategaize_admin -> /admin/walkthroughs
//
// Drei Zustaende:
//   - Keine Walkthrough-Daten         -> "—" + neutral tone
//   - Alle reviewed (pending == 0)    -> "X / X" + success tone
//   - Pending offen                   -> "X / Y" + warning tone

import { Video } from "lucide-react";

import { MetricCard } from "@/app/dashboard/MetricCard";

export interface WalkthroughReviewStatusSummary {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface Props {
  summary: WalkthroughReviewStatusSummary;
  role: "tenant_admin" | "strategaize_admin";
  tenantId: string;
}

export function WalkthroughReviewStatusCard({ summary, role, tenantId }: Props) {
  const reviewed = summary.approved + summary.rejected;
  const noData = summary.total === 0;
  const allDone = summary.total > 0 && summary.pending === 0;

  const value = noData ? "–" : `${reviewed} / ${summary.total}`;
  const hint = noData
    ? "Noch keine Walkthroughs"
    : allDone
      ? "Alle Walkthroughs reviewed"
      : `${summary.pending} zur Review offen`;

  const href =
    role === "strategaize_admin"
      ? "/admin/walkthroughs"
      : `/admin/tenants/${tenantId}/walkthroughs`;

  const tone: "default" | "warning" | "success" = noData
    ? "default"
    : allDone
      ? "success"
      : "warning";

  return (
    <MetricCard
      icon={Video}
      label="Walkthroughs zur Review"
      value={value}
      hint={hint}
      href={href}
      tone={tone}
    />
  );
}
