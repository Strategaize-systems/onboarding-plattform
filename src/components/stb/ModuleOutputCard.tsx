"use client";

// StB-Modul-Workspace — Presentational Card fuer einen Liefer-Triple-Output
// (SLC-175 MT-2, OP V10). Rendert eine Sektion des Liefer-Triples
// (Entscheidung / Standard / Implementierungsschritt) mit ihren Eintraegen.
//
// Reuse-Vorbild: Handbuch-Reader-Render (FEAT-028) — schlichtes Karten-/
// Abschnitts-Rendering, druckbar via Tailwind print:-Modifier (CSS-Print statt
// React-PDF, Founder-Entscheid 2026-06-22). Strings via next-intl (stb.*).

import { useTranslations } from "next-intl";

import type {
  ModulOutputRow,
  OutputTripleKind,
} from "@/lib/stb-vertikale/workspace-read";

export function ModuleOutputCard({
  kind,
  rows,
}: {
  kind: OutputTripleKind;
  rows: ModulOutputRow[];
}) {
  const t = useTranslations("stb.workspace");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 print:break-inside-avoid print:border-slate-300">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 print:text-slate-700">
        {t(`kind.${kind}`)}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("noEntry")}</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {rows.map((r) => (
            <li key={r.id}>
              {r.title && (
                <h3 className="text-sm font-semibold text-slate-900">
                  {r.title}
                </h3>
              )}
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700 print:text-black">
                {r.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
