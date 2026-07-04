// SLC-183 MT-3 (OP V10.2) — Kleine Formatierungs-Helfer fuer die Report-Views.

/** Formatiert ein ISO-Datum als deutsches Datum+Zeit, oder "—" bei null/ungueltig. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Relative Angabe ("vor 3 Std.") fuer Timeline-Eintraege, mit Datum als Fallback. */
export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diffMs = Date.now() - ms;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.round(std / 24);
  if (tage <= 14) return `vor ${tage} ${tage === 1 ? "Tag" : "Tagen"}`;
  return formatDateTime(iso);
}
