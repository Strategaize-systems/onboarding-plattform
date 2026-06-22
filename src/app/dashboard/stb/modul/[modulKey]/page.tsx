import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import {
  isValidModulKey,
  modulKeyToSlug,
  splitBlocksByStufe,
} from "@/lib/stb-vertikale/modul-capture";
import { startOrResumeModulSession } from "./actions";

function blockTitle(
  title: Record<string, string> | string,
  locale: string
): string {
  if (typeof title === "object") {
    return title[locale] ?? title["de"] ?? "";
  }
  return title;
}

// StB-Modul-Capture-Eintritt (SLC-173 MT-1). Env-gated via dashboard/stb/layout.
export default async function StbModulEntryPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    redirect("/login");
  }

  const template = await getTemplateBySlug(supabase, modulKeyToSlug(modulKey));
  if (!template) {
    // Modul noch nicht geseedet (nur M-04 in V10; Rest content-gated SLC-170b).
    notFound();
  }

  const locale = await getLocale();
  const { stufe1, stufe2 } = splitBlocksByStufe(template.blocks);
  const start = startOrResumeModulSession.bind(null, modulKey);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Zurück zum Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
      <p className="text-muted-foreground mt-1">
        Modul-Fragebogen für die eigene Kanzlei · Stufe 1 (Kern) ist Pflicht,
        Stufe 2 (Vertiefung) optional.
      </p>

      <section className="mt-8 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Stufe 1 – Kern (Pflicht)
          </h2>
          <ul className="mt-3 space-y-1.5">
            {stufe1.map((b) => (
              <li key={b.id} className="text-sm text-slate-700">
                {blockTitle(b.title, locale)}{" "}
                <span className="text-muted-foreground">
                  · {b.questions.length} Fragen
                </span>
              </li>
            ))}
            {stufe1.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Keine Pflicht-Blöcke definiert.
              </li>
            )}
          </ul>
        </div>

        {stufe2.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Stufe 2 – Vertiefung (optional)
            </h2>
            <ul className="mt-3 space-y-1.5">
              {stufe2.map((b) => (
                <li key={b.id} className="text-sm text-slate-700">
                  {blockTitle(b.title, locale)}{" "}
                  <span className="text-muted-foreground">
                    · {b.questions.length} Fragen
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <form action={start} className="mt-8">
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
        >
          Modul starten / fortsetzen →
        </button>
      </form>
    </div>
  );
}
