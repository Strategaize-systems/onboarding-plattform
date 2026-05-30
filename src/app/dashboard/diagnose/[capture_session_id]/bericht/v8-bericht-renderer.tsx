// V8 SLC-152 MT-3 (FEAT-066 Web-Companion) — V8-Bericht-Page-Variant.
//
// Server-Component. Liest snapshot aus capture_session.metadata
// (per SLC-148 MT-6 DEC-163) und rendert eine kompakte Web-Variante des
// 17-Seiten-PDFs:
//   - SUI-Hero-Card (Score + Klassifizierung)
//   - Modul-Score-Liste (kompakte Variante von Page 3)
//   - Hebel-Liste (kompakte Variante von Page 14)
//   - Hausaufgaben-Liste (falls non-empty)
//   - Reflexion-Liste (falls non-empty)
//   - Action-Buttons (Download-PDF + Email-Send) als Client-Component-Slot
//
// Web-Variant ist Companion zum PDF, NICHT Replace. PDF bleibt Pflicht-Output.
//
// V6.3 BerichtRenderer bleibt strikt unveraendert — Branch-Switch passiert in
// bericht/page.tsx (Run-Page-Switch-Pattern, [[feedback-v6-v8-coexistence-via-run-page-switch]]).

import type {
  ModulKey,
  V8ReportSnapshot,
} from "@/lib/diagnose/types";
import { V8BerichtActions } from "@/components/diagnose/V8BerichtActions";
import { V8OutroSection } from "./V8OutroSection";

interface V8BerichtRendererProps {
  captureSessionId: string;
  mandantName: string;
  snapshot: V8ReportSnapshot;
  moduleNames: Record<ModulKey, string>;
}

const STUFE_LABEL: Record<number, string> = {
  1: "Stufe 1 — Kritischer Befund",
  2: "Stufe 2 — Erste Ansaetze",
  3: "Stufe 3 — Teilweise etabliert",
  4: "Stufe 4 — Weitgehend etabliert",
  5: "Stufe 5 — Vollstaendig etabliert",
};

const MODUL_ORDER: ModulKey[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];

function classificationToTextColor(color: "rot" | "amber" | "gruen"): string {
  switch (color) {
    case "rot":
      return "text-rose-700 bg-rose-50 ring-rose-200";
    case "amber":
      return "text-amber-700 bg-amber-50 ring-amber-200";
    case "gruen":
      return "text-emerald-700 bg-emerald-50 ring-emerald-200";
  }
}

function stufeToColor(stufe: number): string {
  if (stufe <= 1) return "bg-rose-500";
  if (stufe === 2) return "bg-amber-500";
  if (stufe === 3) return "bg-indigo-500";
  if (stufe === 4) return "bg-emerald-400";
  return "bg-emerald-600";
}

export function V8BerichtRenderer({
  captureSessionId,
  mandantName,
  snapshot,
  moduleNames,
}: V8BerichtRendererProps) {
  const classColor = classificationToTextColor(snapshot.classification.color);
  const finalizedDate = snapshot.finalizedAt.slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Page-Header */}
      <div className="mb-6">
        <div className="font-mono text-xs uppercase tracking-widest text-indigo-600">
          Strategaize · Uebergabefaehigkeits-Diagnose V8.0
        </div>
        <h1 className="mt-2 font-serif text-3xl font-bold text-slate-900">
          {mandantName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Diagnose vom {finalizedDate}</p>
      </div>

      {/* SUI-Hero-Card */}
      <section
        className={`rounded-2xl ring-1 ${classColor} p-6 mb-8`}
        aria-label="SUI-Score"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest opacity-80">
              SUI-Score (Strukturelle Uebergabefaehigkeit)
            </div>
            <div className="mt-3 font-serif text-6xl font-bold leading-none">
              {snapshot.sui}
              <span className="ml-1 text-xl opacity-60">/100</span>
            </div>
            <div className="mt-3 font-serif text-xl font-semibold">
              {snapshot.classification.label}
            </div>
            <p className="mt-2 max-w-md text-sm leading-relaxed opacity-90">
              {snapshot.classification.meaning}
            </p>
          </div>
        </div>
      </section>

      {/* Modul-Score-Liste */}
      <section className="mb-8" aria-label="Modul-Profil">
        <h2 className="mb-3 font-serif text-xl font-semibold text-slate-900">
          Modul-Profil (9 Module)
        </h2>
        <ul className="divide-y divide-slate-200 rounded-xl bg-white ring-1 ring-slate-200">
          {MODUL_ORDER.map((key) => {
            const score = snapshot.moduleScores[key] ?? 0;
            const stufe = snapshot.stufenMapping[key] ?? 1;
            return (
              <li key={key} className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-xs uppercase text-slate-400 w-8">
                  {key.toUpperCase()}
                </span>
                <span className="flex-1 font-serif text-sm font-semibold text-slate-800">
                  {moduleNames[key] ?? key}
                </span>
                <span
                  className={`inline-block h-2 w-12 rounded-full ${stufeToColor(stufe)}`}
                  aria-label={`Stufe ${stufe} von 5`}
                />
                <span className="font-mono text-xs text-slate-500 w-16 text-right">
                  Stufe {stufe} · {score}/10
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Hebel-Liste */}
      {snapshot.hebel.length > 0 ? (
        <section className="mb-8" aria-label="Top-3-Hebel">
          <h2 className="mb-3 font-serif text-xl font-semibold text-slate-900">
            Ihre drei Strategie-Hebel
          </h2>
          <ol className="space-y-3">
            {snapshot.hebel.map((hebel, idx) => (
              <li
                key={hebel.modul_id}
                className="rounded-xl bg-white ring-1 ring-slate-200 px-4 py-4"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
                    Prioritaet {idx + 1}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {hebel.modul_id.toUpperCase()}
                  </span>
                </div>
                <h3 className="mt-1 font-serif text-base font-bold text-slate-900">
                  {hebel.modul_name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Aktuell: {STUFE_LABEL[hebel.stufe] ?? `Stufe ${hebel.stufe}`} ·{" "}
                  Score {hebel.score}/10
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {hebel.empfehlung}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Hausaufgaben */}
      {snapshot.hausaufgaben.length > 0 ? (
        <section className="mb-8" aria-label="Hausaufgaben">
          <h2 className="mb-3 font-serif text-xl font-semibold text-slate-900">
            Rechtliche &amp; strukturelle Hausaufgaben (Modul 0)
          </h2>
          <ul className="space-y-2">
            {snapshot.hausaufgaben.map((item) => (
              <li
                key={item.frage_id}
                className={`rounded-lg px-4 py-3 ring-1 ${
                  item.status === "nein"
                    ? "bg-rose-50 ring-rose-200"
                    : "bg-amber-50 ring-amber-200"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest font-bold ${
                      item.status === "nein" ? "text-rose-700" : "text-amber-700"
                    }`}
                  >
                    {item.status === "nein" ? "Nein" : "Teilweise"}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {item.frage_id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{item.frage_text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Reflexion */}
      {snapshot.reflexionen.length > 0 ? (
        <section className="mb-8" aria-label="Reflexion">
          <h2 className="mb-3 font-serif text-xl font-semibold text-slate-900">
            Ihre Reflexion (Modul 10)
          </h2>
          <ul className="space-y-3">
            {snapshot.reflexionen.map((item) => (
              <li
                key={item.frage_id}
                className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-4 py-3"
              >
                <p className="text-xs italic text-indigo-700">
                  {item.frage_text}
                </p>
                <p className="mt-2 text-sm font-serif text-slate-800">
                  &ldquo;{item.antwort_text}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* V8.1 Lead-Conversion-Outro (SLC-162 MT-6) — analog zu PDF Pages 16-17 */}
      {snapshot.hebel.length === 3 ? (
        <V8OutroSection hebel={snapshot.hebel} />
      ) : null}

      {/* Action-Slot (Client-Component) */}
      <V8BerichtActions captureSessionId={captureSessionId} />

      {/* Footer-Pflicht */}
      <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        Diese Web-Ansicht ist Companion zum vollstaendigen 17-Seiten-PDF.
        Bitte herunterladen oder per E-Mail senden, um den vollen Bericht zu
        sehen.
      </footer>
    </div>
  );
}
