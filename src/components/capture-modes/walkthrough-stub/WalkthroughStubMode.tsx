/**
 * SLC-038 — WalkthroughStubMode UI-Komponente.
 *
 * Pseudo-Mode-Spike (DEC-040): validiert SC-V4-6 — neuer Capture-Mode kann
 * ohne Schema-Aenderung eingefuehrt werden. Diese Komponente ist die UI-Vorlage
 * fuer V5/V6-Modes (Walkthrough, Diary).
 *
 * Verhalten:
 *   - Kein User-Input, kein Submit-Button.
 *   - Reine Platzhalter-Box mit Hinweis auf zukuenftige Implementierung.
 *
 * Wird ueber CAPTURE_MODE_REGISTRY registriert (siehe registry.ts).
 */
export function WalkthroughStubMode() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Capture-Mode Spike
        </div>
        <h1 className="mb-3 text-2xl font-bold text-slate-900">
          Walkthrough-Mode (V5)
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          Dieser Capture-Mode wird in einer spaeteren Version implementiert.
          Aktuell reserviert als Architektur-Spike (FEAT-025, SC-V4-6).
        </p>
        <div className="mt-6 rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <strong className="font-semibold text-slate-700">Hinweis:</strong>{" "}
          Diese Seite wird im Self-Service-Cockpit nicht beworben und enthaelt
          keine produktive Funktion.
        </div>
      </div>
    </div>
  );
}
