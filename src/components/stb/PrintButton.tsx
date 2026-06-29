"use client";

// StB-Modul-Workspace — Druck-/PDF-Button (SLC-175 MT-2, OP V10).
// "Druckbar" (AC-175-2) via Browser-Print-Dialog (window.print()) auf der
// CSS-Print-Ansicht — Founder-Entscheid 2026-06-22: CSS-Print statt React-PDF,
// reust den FEAT-028-Handbuch-Reader-Ansatz (gleiches DOM, print:-Modifier),
// kein divergierendes PDF-Dokument. Der Button selbst ist im Druck ausgeblendet.

import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("stb.workspace");

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-primary/50 hover:text-slate-900 print:hidden"
    >
      {t("print")}
    </button>
  );
}
