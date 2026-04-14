"use client";

import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "gradient-warning" | "gradient-primary" | "neutral" }
> = {
  collecting: { label: "In Bearbeitung", variant: "gradient-warning" },
  submitted: { label: "Eingereicht", variant: "gradient-primary" },
  locked: { label: "Gesperrt", variant: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
