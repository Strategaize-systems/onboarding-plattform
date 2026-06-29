import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTemplateBySlug } from "@/lib/db/template-queries";
import { splitBlocksByStufe } from "@/lib/stb-vertikale/modul-capture";
import { BLUEPRINT_SLUG } from "@/lib/stb-vertikale/blueprint";
import { startOrResumeBlueprintSession } from "./actions";

// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/page.tsx (SLC-173 MT-1).
// Blueprint-Capture-Eintritt (SLC-172 MT-1). Env-gated via dashboard/stb/layout.

function blockTitle(
  title: Record<string, string> | string,
  locale: string
): string {
  if (typeof title === "object") {
    return title[locale] ?? title["de"] ?? "";
  }
  return title;
}

export default async function StbBlueprintEntryPage() {
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

  const template = await getTemplateBySlug(supabase, BLUEPRINT_SLUG);
  if (!template) {
    // Blueprint noch nicht geseedet -> 404 (in V10 ist MIG-126 live).
    notFound();
  }

  const locale = await getLocale();
  const { stufe1, stufe2 } = splitBlocksByStufe(template.blocks);
  const stufe1Questions = stufe1.reduce((n, b) => n + b.questions.length, 0);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <Link
        href="/dashboard/stb"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Zurück zur Übersicht
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
      <p className="text-muted-foreground mt-1">
        Standortbestimmung für die eigene Kanzlei · Stufe 1 (Kern,{" "}
        {stufe1Questions} Fragen) ist der Gratis-Test. Vertiefungsfragen
        erscheinen nur dort, wo die Kern-Antwort Handlungsbedarf zeigt.
      </p>

      <section className="mt-8 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Stufe 1 – Kern (der Gratis-Test)
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
              Stufe 2 – Vertiefung (adaptiv)
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Diese Fragen sind nicht Teil des automatischen Pfads. Die KI bohrt
              gezielt nur dort nach, wo eine Kern-Antwort gelb oder rot ergibt.
            </p>
          </div>
        )}
      </section>

      <form action={startOrResumeBlueprintSession} className="mt-8">
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
        >
          Blueprint starten / fortsetzen →
        </button>
      </form>
    </div>
  );
}
