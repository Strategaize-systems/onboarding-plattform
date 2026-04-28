// SLC-042 MT-4 — Cockpit-Card "Mitarbeiter-Bloecke reviewed".
//
// Pure Render-Komponente. summary kommt von der Server-Component (dashboard/page.tsx)
// via getReviewSummary. Der Link variiert je nach Rolle:
//   - tenant_admin -> /dashboard/reviews (read-only Sub-Page, MT-5)
//   - strategaize_admin -> /admin/tenants/[tenantId]/reviews (kommt in SLC-043,
//     404 bis dahin akzeptabel laut Slice-Spec AC-12)

import { CheckCircle2 } from "lucide-react";

import { MetricCard } from "@/app/dashboard/MetricCard";

export interface BlockReviewStatusSummary {
  approved: number;
  pending: number;
  rejected: number;
  totalEmployeeBlocks: number;
}

interface Props {
  summary: BlockReviewStatusSummary;
  role: "tenant_admin" | "strategaize_admin";
  tenantId: string;
}

export function BlockReviewStatusCard({ summary, role, tenantId }: Props) {
  const total = summary.totalEmployeeBlocks;
  const reviewed = summary.approved + summary.rejected;
  const allDone = total > 0 && summary.pending === 0;
  const noEmployeeData = total === 0;

  const value = noEmployeeData ? "–" : `${reviewed} / ${total}`;
  const hint = noEmployeeData
    ? "Noch keine Mitarbeiter-Beitraege"
    : allDone
      ? "Alle Mitarbeiter-Bloecke reviewed"
      : `${summary.pending} Bloecke offen`;

  const href =
    role === "strategaize_admin"
      ? `/admin/tenants/${tenantId}/reviews`
      : "/dashboard/reviews";

  const tone: "default" | "warning" | "success" = noEmployeeData
    ? "default"
    : allDone
      ? "success"
      : "warning";

  return (
    <MetricCard
      icon={CheckCircle2}
      label="Mitarbeiter-Bloecke reviewed"
      value={value}
      hint={hint}
      href={href}
      tone={tone}
    />
  );
}
