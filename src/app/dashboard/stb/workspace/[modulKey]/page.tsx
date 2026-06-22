// StB-Modul-Workspace — Detail (SLC-175 MT-1, OP V10).
//
// Liest die modul_output-Rows EINES Moduls (RLS-scoped), gruppiert sie zum
// Liefer-Triple (Entscheidung/Standard/Implementierungsschritt) + KI-Hebel-Liste
// (Reifegrad 1-4) und rendert sie lesbar. Empty-/Error-States nach AC-175-4.
// Env-gated via dashboard/stb/layout. Tenant-Isolation = RLS (MIG-124).
//
// Rendering ist in MT-1 funktional; die extrahierten Presentational-Komponenten
// (ModuleOutputCard/KiHebelList), Print-View (React-PDF, FEAT-086) und volle
// i18n folgen in MT-2 (/frontend).

import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import { isValidModulKey, modulKeyToSlug } from "@/lib/stb-vertikale/modul-capture";
import {
  readModulOutputsForModul,
  groupModuleOutputs,
  modulKeyToLabel,
  type ModuleWorkspaceData,
} from "@/lib/stb-vertikale/workspace-read";

export default async function StbWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ modulKey: string }>;
}) {
  const { modulKey } = await params;
  if (!isValidModulKey(modulKey)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Template-Name fuer den Titel (best-effort; faellt auf das Label zurueck).
  const template = await getTemplateBySlug(supabase, modulKeyToSlug(modulKey));
  const heading = template?.name ?? modulKeyToLabel(modulKey);

  let data: ModuleWorkspaceData | null = null;
  let loadError = false;
  try {
    const rows = await readModulOutputsForModul(supabase, modulKey);
    data = groupModuleOutputs(modulKey, rows);
  } catch {
    loadError = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/dashboard/stb/workspace"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Zurück zum Workspace
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
      <p className="mt-1 text-muted-foreground">
        Operative Wirk-Schicht ({modulKeyToLabel(modulKey)}) — kein
        Organisationshandbuch.
      </p>

      {loadError ? (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Die Ergebnisse dieses Moduls konnten nicht geladen werden. Bitte später
          erneut versuchen.
        </div>
      ) : !data || data.total === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Noch kein Ergebnis
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Für dieses Modul liegt noch kein Output vor. Sobald der Fragebogen
            ausgefüllt und die Synthese abgeschlossen ist, erscheinen Entscheidung,
            Standard, Implementierungsschritt und die KI-Hebel hier.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Liefer-Triple */}
          <section className="space-y-5">
            {data.triple.map((section) => (
              <div
                key={section.kind}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  {section.label}
                </h2>
                {section.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Kein Eintrag.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-4">
                    {section.rows.map((r) => (
                      <li key={r.id}>
                        {r.title && (
                          <h3 className="text-sm font-semibold text-slate-900">
                            {r.title}
                          </h3>
                        )}
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                          {r.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          {/* KI-Hebel-Liste (Reifegrad-gestaffelt) */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              KI-Hebel
            </h2>
            {data.kiHebel.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Keine KI-Hebel ausgewiesen.
              </p>
            ) : (
              <ul className="mt-3 space-y-4">
                {data.kiHebel.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-600">
                      {r.reifegrad ? `Reifegrad ${r.reifegrad}` : "ohne"}
                    </span>
                    <div>
                      {r.title && (
                        <h3 className="text-sm font-semibold text-slate-900">
                          {r.title}
                        </h3>
                      )}
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                        {r.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
