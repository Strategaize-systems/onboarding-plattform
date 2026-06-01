// V8.1 SLC-162 MT-6 — V8-Web-Bericht-Outro-Section.
//
// Server-Component analog zum PDF-OutroPage (pages/outro.tsx). Rendert die
// 4-Block-Hierarchie der V8.1-Outro-Section per DEC-170/171:
//   1. Strategaize-Vorstellung (2 Placeholder-Absaetze bis MT-3 Founder-Text)
//   2. 3 Verkaufs-Style-Empfehlungs-Cards (shadcn/ui Card)
//   3. Video-Platzhalter-Box (Strategaize-Brand-Visual)
//   4. CTA-Button (shadcn/ui Button asChild → Magic-Link, Placeholder bis SLC-163)
//
// Wird in v8-bericht-renderer.tsx nach der Reflexion-Section gerendert und
// erbt den deterministischen V8.0-Fallback-Pfad (snapshot.hebel.empfehlung
// 1:1) im V8.1-Initial-State. LLM-Augmentation des Web-Bericht-Pfads ist
// V8.2+ (siehe ARCHITECTURE.md V8.1 Section, kein Web-Loading-State noetig
// im V8.1-Scope).

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HebelItem } from "@/lib/diagnose/types";
import { triggerStrategaizeFreigabe } from "./actions";

/**
 * Web-Bericht-CTA nutzt seit SLC-163 die Server-Action triggerStrategaizeFreigabe
 * mit Session-basierter Auth (kein Magic-Link-Token noetig). Die Form bindet
 * captureSessionId an die Action; Erfolg redirected zu /strategaize-anfrage/
 * bestaetigung. Placeholder-Konstante bleibt exportiert fuer Vitest-Kompatibilitaet.
 */
export const V8_OUTRO_WEB_CTA_PLACEHOLDER_URL =
  "#cta-magic-link-token-replaced-in-slc163";

interface V8OutroSectionProps {
  /** 3 Hebel-Bloecke aus snapshot.hebel (deterministische V8.0-Texte). */
  hebel: HebelItem[];
  /**
   * capture_session.id fuer die Server-Action-Bindung. Pflicht ab SLC-163 MT-9.
   * In Tests darf der String leer sein — die Action wirft dann beim Submit.
   */
  captureSessionId?: string;
}

// MT-3 — Mock-Text bis zur redaktionellen Founder-Freigabe. Wir-Voice,
// audit-clean (siehe IMP-918 Memory: Marker nur im Kommentar oberhalb,
// nicht im String-Literal). Tausch durch finalen Strategaize-Vorstellungs-
// Text vor V8.1-Release. Muss identisch zu PDF-Variante in
// src/lib/pdf/mandanten-report-v2/pages/outro.tsx bleiben.
const STRATEGAIZE_VORSTELLUNG_PLACEHOLDER: readonly string[] = [
  "Strategaize begleitet Unternehmer durch den Uebergang zur naechsten Generation. Wir arbeiten mit Inhabern, die ihre Firma uebergabefaehig machen wollen — strukturiert, ohne Verkaufs-Druck, mit klarem Blick auf das, was heute schon traegt und wo noch Aufbau noetig ist.",
  "Unser Ansatz verbindet Strategie, Fuehrung, Strukturen und Finanzen. Aus den Antworten Ihrer Diagnose lesen wir die drei Bewegungen heraus, die in Ihrem Unternehmen den groessten Unterschied machen — und besprechen sie mit Ihnen in einem Folgegespraech, unverbindlich und auf Augenhoehe.",
];

export function V8OutroSection({
  hebel,
  captureSessionId,
}: V8OutroSectionProps) {
  if (hebel.length !== 3) {
    throw new Error(
      `V8OutroSection: expected exactly 3 hebel, got ${hebel.length}`,
    );
  }

  const submitAction = captureSessionId
    ? triggerStrategaizeFreigabe.bind(null, captureSessionId)
    : undefined;

  return (
    <section
      className="mt-12 space-y-10"
      aria-label="V8.1 Lead-Conversion-Outro"
    >
      {/* Block 1: Strategaize-Vorstellung */}
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-indigo-600">
          Ueber Strategaize
        </div>
        <h2 className="mt-2 font-serif text-3xl font-bold text-slate-900">
          Wir holen Sie ab
        </h2>
        <div className="mt-4 space-y-3 text-base leading-relaxed text-slate-700">
          {STRATEGAIZE_VORSTELLUNG_PLACEHOLDER.map((paragraph, idx) => (
            <p key={`v8-outro-vorstellung-${idx}`}>{paragraph}</p>
          ))}
        </div>
      </div>

      {/* Block 2: 3 Verkaufs-Style-Empfehlungs-Cards (DEC-171) */}
      <div>
        <h3 className="font-serif text-xl font-semibold text-slate-900">
          Drei Bewegungen, die in Ihrem Unternehmen den Unterschied machen
        </h3>
        <div className="mt-4 grid gap-4">
          {hebel.map((h, idx) => (
            <Card
              key={`v8-outro-card-${idx}`}
              className="border-b-4 border-b-emerald-400 bg-slate-50/60"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <CardTitle className="font-serif text-lg font-bold leading-snug text-slate-900">
                  {h.modul_name}
                </CardTitle>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  Aktuelle Stufe: {h.stufe}/5
                </span>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm leading-relaxed text-slate-700">
                  {h.empfehlung}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Block 3: Video-Platzhalter (Strategaize-Brand-Box) */}
      <div className="rounded-2xl bg-indigo-950 p-8 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded bg-white px-3 py-1 font-serif text-sm font-bold text-slate-900">
            StrategAIze
          </span>
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">
            Wie wir arbeiten
          </span>
        </div>
        <p className="mt-4 font-serif text-2xl font-bold leading-snug">
          Video folgt in Kuerze
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-200">
          Wir zeigen Ihnen, wie Strategaize Unternehmer-Uebergaben begleitet —
          ohne Pricing-Druck, ohne Verkaufs-Logik.
        </p>
      </div>

      {/* Block 4: CTA-Button via Server-Action triggerStrategaizeFreigabe */}
      <div className="rounded-2xl bg-indigo-950 p-8 text-white">
        <div className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">
          Naechster Schritt
        </div>
        <h3 className="mt-2 font-serif text-2xl font-bold leading-snug">
          Lassen Sie uns reden — unverbindlich, ohne Pricing-Druck
        </h3>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-200">
          Strategaize meldet sich nach Ihrer Anfrage und stimmt mit Ihnen einen
          Termin ab, in dem wir Ihre Diagnose gemeinsam durchgehen. Kein
          Verkaufs-Druck, keine Pauschal-Antworten.
        </p>
        <form action={submitAction} className="mt-5">
          <Button
            type="submit"
            size="lg"
            disabled={!submitAction}
            className="min-h-[44px] bg-emerald-400 px-6 font-mono text-sm font-bold uppercase tracking-widest text-indigo-950 hover:bg-emerald-300"
          >
            Mit Strategaize sprechen
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-300">
          Strategaize meldet sich innerhalb von 2 Werktagen.
        </p>
      </div>
    </section>
  );
}
