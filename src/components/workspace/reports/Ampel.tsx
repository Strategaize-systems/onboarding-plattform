// SLC-183 MT-3 (OP V10.2) — Kleiner farbiger Ampel-Punkt fuer die Report-Views.
// green=emerald, yellow=amber, red=rose, null="—" (slate). Wiederverwendbar.

import { cn } from "@/lib/utils";

interface AmpelProps {
  value: "green" | "yellow" | "red" | null;
  className?: string;
}

const AMPEL_META: Record<
  "green" | "yellow" | "red",
  { dot: string; label: string }
> = {
  green: { dot: "bg-emerald-500", label: "Grün" },
  yellow: { dot: "bg-amber-500", label: "Gelb" },
  red: { dot: "bg-rose-500", label: "Rot" },
};

export function Ampel({ value, className }: AmpelProps) {
  if (value === null) {
    return <span className={cn("text-slate-400", className)}>—</span>;
  }
  const meta = AMPEL_META[value];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={meta.label}
    >
      <span
        aria-hidden
        className={cn("h-2.5 w-2.5 rounded-full", meta.dot)}
      />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}
