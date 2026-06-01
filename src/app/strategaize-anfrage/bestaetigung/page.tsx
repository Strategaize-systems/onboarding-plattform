// V8.1 SLC-163 MT-7 — Bestaetigungs-Page nach CTA-Klick.
//
// Strategaize-Wir-Voice, neutral, ohne Pricing-Druck. Tonality-Audit
// laeuft im /qa-Gate (kein Audit-Scope-Extension hier — Wir-Voice ist
// strukturell aus dem Outro-Scope abgedeckt).

export const metadata = {
  title: "Anfrage bestaetigt — Strategaize",
  robots: { index: false, follow: false },
};

export default function BestaetigungPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-8 shadow-sm">
        <div className="mb-6 inline-flex items-center gap-2 rounded bg-emerald-100 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-emerald-700">
          Anfrage angekommen
        </div>
        <h1 className="font-serif text-3xl font-bold text-slate-900">
          Wir haben Ihre Anfrage erhalten
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Vielen Dank fuer Ihr Interesse an einem Folgegespraech mit
          Strategaize. Wir melden uns innerhalb von zwei Werktagen direkt
          bei Ihnen, um einen passenden Termin abzustimmen.
        </p>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Falls Sie zwischenzeitlich Fragen haben, erreichen Sie uns unter{" "}
          <a
            className="text-indigo-700 underline"
            href="mailto:info@strategaize.de"
          >
            info@strategaize.de
          </a>
          .
        </p>
        <p className="mt-8 text-sm text-slate-500">
          Mit freundlichen Gruessen
          <br />
          Ihr Strategaize-Team
        </p>
      </div>
      <footer className="mt-10 text-center text-xs text-slate-400">
        Strategaize · Uebergabefaehigkeits-Diagnose V8.1 · Datenschutz:{" "}
        <a className="underline" href="/datenschutz">
          strategaize.de/datenschutz
        </a>{" "}
        · Impressum:{" "}
        <a className="underline" href="/impressum">
          strategaize.de/impressum
        </a>
      </footer>
    </main>
  );
}
