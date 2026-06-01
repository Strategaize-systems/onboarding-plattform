// V8.1 SLC-163 MT-7 — Error-Page bei Invalid/Expired/Malformed Magic-Link.
//
// Strategaize-Wir-Voice, freundlich, mit Hinweis auf StB-Kontakt-Pfad als
// alternativem Weg. Keine technischen Details (token excerpt nicht angezeigt
// — Excerpt landet nur im error_log).

const REASON_TEXTS: Record<string, string> = {
  invalid_signature: "Der Link konnte nicht eindeutig zugeordnet werden.",
  expired: "Der Link ist abgelaufen.",
  malformed: "Der Link ist unvollstaendig oder fehlerhaft.",
  internal: "Es ist ein technisches Problem aufgetreten.",
};

export const metadata = {
  title: "Link nicht gueltig — Strategaize",
  robots: { index: false, follow: false },
};

interface ErrorPageProps {
  searchParams: Promise<{ reason?: string }>;
}

export default async function StrategaizeAnfrageErrorPage({
  searchParams,
}: ErrorPageProps) {
  const { reason } = await searchParams;
  const reasonText =
    (reason && REASON_TEXTS[reason]) ?? "Der Link konnte nicht verarbeitet werden.";

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded bg-amber-100 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-amber-800">
          Link nicht gueltig
        </div>
        <h1 className="font-serif text-3xl font-bold text-slate-900">
          {reasonText}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Sie koennen Strategaize jederzeit direkt erreichen. Schreiben Sie
          uns einfach an{" "}
          <a
            className="text-indigo-700 underline"
            href="mailto:info@strategaize.de"
          >
            info@strategaize.de
          </a>
          {" — "}wir melden uns innerhalb von zwei Werktagen.
        </p>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          Alternativ koennen Sie ueber Ihren Steuerberater den Kontakt zu
          uns aufnehmen. Er kennt Ihre Diagnose und kann den naechsten
          Schritt mit Ihnen besprechen.
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
