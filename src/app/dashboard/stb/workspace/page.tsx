// StB-Modul-Workspace — Uebersicht (SLC-175 MT-1, OP V10).
//
// Konsum-Startseite der Lieferdomaene: zeigt je Modul mit erzeugten Outputs eine
// Karte (Liefer-Triple + KI-Hebel-Counts) und verlinkt auf die Detailseite.
// Env-gated via dashboard/stb/layout (StbLayout). Tenant-Isolation = RLS
// (modul_output_tenant_read, MIG-124) — keine manuelle tenant-Filterung.
//
// Rendering ist in MT-1 bewusst funktional/lesbar; die polierten Presentational-
// Komponenten (ModuleOutputCard/KiHebelList) + Print + volle i18n folgen in MT-2.

import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  readWorkspaceOutputs,
  summarizeModulOutputs,
  modulKeyToLabel,
  type ModulSummary,
} from "@/lib/stb-vertikale/workspace-read";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function StbWorkspacePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let summaries: ModulSummary[] = [];
  let loadError = false;
  try {
    const rows = await readWorkspaceOutputs(supabase);
    summaries = summarizeModulOutputs(rows);
  } catch {
    loadError = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Zurück zum Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">Modul-Workspace</h1>
      <p className="mt-1 text-muted-foreground">
        Die operative Wirk-Schicht der eigenen Kanzlei: Entscheidung, Standard und
        Implementierungsschritt je Modul, plus die KI-Hebel nach Reifegrad.
      </p>

      {loadError ? (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Die Modul-Ergebnisse konnten nicht geladen werden. Bitte später erneut
          versuchen.
        </div>
      ) : summaries.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Noch keine Modul-Ergebnisse
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald ein Modul-Fragebogen ausgefüllt und die Synthese durchgelaufen
            ist, erscheinen hier die Ergebnisse.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {summaries.map((s) => (
            <li key={s.modulKey}>
              <Link
                href={`/dashboard/stb/workspace/${s.modulKey}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-primary/50"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    {modulKeyToLabel(s.modulKey)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    zuletzt {formatDate(s.latestCreatedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.tripleCount} Liefer-Output{s.tripleCount === 1 ? "" : "s"} ·{" "}
                  {s.kiHebelCount} KI-Hebel
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
