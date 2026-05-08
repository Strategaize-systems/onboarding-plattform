// SLC-079 MT-2 — Confidence-Pille (DEC-087 Ampel).
// Server Component: kein State, rendering only.

import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  band: "green" | "yellow" | "red";
  score: number | null;
  reasoning?: string | null;
  className?: string;
}

const BAND_STYLES: Record<ConfidenceBadgeProps["band"], string> = {
  green: "bg-green-100 text-green-800 ring-green-200",
  yellow: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  red: "bg-red-100 text-red-800 ring-red-200",
};

const BAND_LABEL: Record<ConfidenceBadgeProps["band"], string> = {
  green: "hohe Konfidenz",
  yellow: "mittlere Konfidenz",
  red: "Unmapped / niedrige Konfidenz",
};

export function ConfidenceBadge({
  band,
  score,
  reasoning,
  className,
}: ConfidenceBadgeProps) {
  const tooltipParts: string[] = [BAND_LABEL[band]];
  if (typeof score === "number") {
    tooltipParts.push(`Score ${score.toFixed(2)}`);
  }
  if (reasoning && reasoning.trim().length > 0) {
    tooltipParts.push(reasoning);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        BAND_STYLES[band],
        className,
      )}
      title={tooltipParts.join(" — ")}
      data-testid={`confidence-badge-${band}`}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          band === "green" && "bg-green-500",
          band === "yellow" && "bg-yellow-500",
          band === "red" && "bg-red-500",
        )}
      />
      {band === "red" && score === null ? "Unmapped" : BAND_LABEL[band]}
    </span>
  );
}
