"use client";

// StB-Modul-Workspace — KI-Hebel-Liste (SLC-175 MT-2, OP V10).
// Rendert die KI-Hebel eines Moduls als Reifegrad-gestaffelte Liste (1-4,
// ohne-Reifegrad zuletzt — Sortierung kommt aus groupModuleOutputs, MT-1).
// Reifegrad-Badge je Eintrag. Druckbar via Tailwind print:-Modifier.

import { useTranslations } from "next-intl";

import type { ModulOutputRow } from "@/lib/stb-vertikale/workspace-read";

export function KiHebelList({ items }: { items: ModulOutputRow[] }) {
  const t = useTranslations("stb.workspace");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 print:break-inside-avoid print:border-slate-300">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 print:text-slate-700">
        {t("kiHebelHeading")}
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("kiHebelEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {items.map((r) => (
            <li key={r.id} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-600 print:border print:border-slate-300 print:bg-white">
                {r.reifegrad
                  ? t("reifegrad", { grade: r.reifegrad })
                  : t("reifegradNone")}
              </span>
              <div>
                {r.title && (
                  <h3 className="text-sm font-semibold text-slate-900">
                    {r.title}
                  </h3>
                )}
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700 print:text-black">
                  {r.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
