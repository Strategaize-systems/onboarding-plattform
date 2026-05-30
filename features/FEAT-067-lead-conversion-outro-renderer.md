# FEAT-067 — Lead-Conversion-Outro-Renderer (PDF + Web-Bericht)

**Version:** V8.1
**Status:** planned
**Created:** 2026-05-30
**Related Backlog:** BL-134
**Related Slice:** to be planned in /slice-planning V8.1

## Purpose

Erweitert den V8.0-Mandanten-Bericht um eine **Lead-Conversion-Outro-Section** am Ende, die das Vertrauen des Mandanten in Strategaize aufbaut und die Bereitschaft zum Folgegespraech steigert (Founder-Direktive 2026-05-29: "Vertrauen in uns und Bereitschaft mit uns zu reden steigern.").

Der V8.0-Bericht endet aktuell mit der CTA-Page (Seiten 16-17 in `src/lib/pdf/mandanten-report-v2/pages/cta.tsx`), die einen generischen "Folgegespraech vereinbaren"-CTA mit StB-Kontakt-Slot (Fallback Strategaize) zeigt. V8.1 baut darauf auf mit einer expliziteren Strategaize-Vorstellung + personalisierten Empfehlungen + Video-Platzhalter + klarem "Mit Strategaize sprechen"-CTA.

Der Renderer liefert die **visuelle Outro-Section** in zwei Distribution-Pfaden:
- **PDF-Outro-Pages**: neue @react-pdf v4 Pages, eingehaengt vor oder nach der V8.0-CTA-Page (`/architecture` entscheidet Position via Q-V8.1-E).
- **V8-Web-Bericht-Section**: neue React-Component im `src/app/dashboard/diagnose/[id]` Bericht-Page-Pfad (analog V7.2 BlockSectionCard).

FEAT-067 liefert nur den **Renderer + Daten-Slots**. Die CTA-Mechanik (Click-Handler + Email-Trigger + Flag-Setzung) ist FEAT-068. Die LLM-Augmentation der 3 Empfehlungs-Texte ist FEAT-069.

## Problem

- V8.0-CTA-Page ist generisch ("Folgegespraech zur Uebergabe-Strategie") — keine explizite Strategaize-Vorstellung, kein Trust-Building, kein personalisiertes Empfehlungs-Block.
- Mandant kennt Strategaize-Marke nicht zwingend (Onboarding-Plattform wird via StB-Co-Hosting verteilt) — Strategaize-Vorstellung muss im Bericht selbst stehen.
- PDF + Web-Bericht laufen ueber 2 verschiedene Renderer (V8.0 PDF via @react-pdf, Web-Bericht via Next.js React-Server-Components) — Outro-Layout muss in beiden Pfaden visuell konsistent sein.
- Master-Vorlage `docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (Dev-System) zeigt keine V8.1-Outro-Section — neuer redaktioneller Inhalt muss freigegeben werden vor Render-Implementierung.

## In Scope

### Outro-Section-Layout (4 Bloecke)

1. **Strategaize-Vorstellungs-Block** (2-3 Absaetze, Strategaize-Wir-Voice)
   - Eyebrow: "UEBER STRATEGAIZE" (JetBrains Mono)
   - Titel: "Wir holen Sie ab — wo Sie heute stehen" (Fraunces, Hero-Size)
   - Body: 2-3 Absaetze (Tonalitaet siehe DEC-V8.1-Tonalitaet, Strategaize-Wir-Voice, konsistent zu V8.0)
   - Inhalt redaktionell durch Founder freigegeben (NICHT LLM-generiert, statisch im Template oder Text-Override per FEAT-055 inline-text-override)

2. **Personalisierte 3-Empfehlungs-Block** (3 Cards/Sektionen)
   - Eyebrow: "WAS WIR FUER SIE TUN KOENNTEN"
   - Titel: "Drei Bewegungen, die in Ihrem Unternehmen den Unterschied machen"
   - 3 Empfehlungs-Cards basierend auf selectThreeHebel-Output (existiert seit SLC-148 MT-4):
     - Modul-Name (z.B. "Modul 4 — Operative Skalierbarkeit")
     - Aktuelle-Stufe-Anzeige (z.B. "Stufe 2/5")
     - Empfehlungs-Text (2-3 Saetze, LLM-augmentiert via FEAT-069 mit deterministischem Fallback)
   - Visual-Style: analog V8.0-Hebel-Block (Page 14 Strategie-Hebel), aber verkaufsorientierter (Pre-Selling der Strategaize-Beratung statt Selbst-Beobachtung)

3. **Video-Block-Platzhalter** (statisch, ohne echtes Video in V8.1)
   - Eyebrow: "EINBLICK"
   - Titel: "Wie wir arbeiten — in 90 Sekunden" (oder aequivalent, redaktionell)
   - Body: Box mit Strategaize-Logo + Tagline "Video folgt in Kuerze" oder Strategaize-Brand-Block (PDF kann kein eingebettetes Video, Web kann es theoretisch — V8.1 zeigt in beiden Pfaden Platzhalter, echtes Video kommt V8.2+).
   - Layout-Slot vorbereitet, damit V8.2-Video-Integration ohne Re-Design moeglich.

4. **CTA-Block "Mit Strategaize sprechen"** (CTA-Slot, Implementierung siehe FEAT-068)
   - Hero-Card (`brandPrimaryDark` Background analog V8.0-CtaPage)
   - Eyebrow: "NAECHSTER SCHRITT"
   - Titel: "Lassen Sie uns reden — unverbindlich, ohne Pricing-Druck"
   - Body: 2-3 Saetze (Founder-Pitch, Wir-Voice)
   - CTA-Button-Slot: Im PDF Magic-Link-URL (FEAT-068 generiert Token), im Web Server-Action-Button (FEAT-068 hooked Click-Handler)
   - Bestaetigungs-Hinweis: "Strategaize meldet sich innerhalb von 2 Werktagen."

### Distribution-Pfade

5. **PDF-Outro-Pages** als neue @react-pdf v4 Pages in `src/lib/pdf/mandanten-report-v2/pages/outro.tsx`
   - Pflicht-Reuse: bestehende V8.0-Theme-Konstanten (COLOR, SPACING aus `theme.ts`), Fraunces + JetBrains Mono Fonts, brandPrimaryDark/brandAccent-Palette.
   - feedback_react_pdf_v4 Memory-Regeln zwingend beachten (kein rgba-Alpha, kein SVG-Image, kein null-in-Style-Array, Image-needs-Buffer).
   - Page-Position: vor V8.0-CtaPage (16-17) ODER ersetzt CtaPage komplett — entscheidet `/architecture` via Q-V8.1-E.

6. **V8-Web-Bericht-Section** als React-Component in `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx` (oder analoger Pfad)
   - Tailwind + shadcn/ui (analog V7.3 BlockSectionCard)
   - Style Guide V2 konform (Block-Color-Palette, Touch-Target >= 44px)
   - Wird im V8-Web-Bericht (FEAT-064 / FEAT-066) angehaengt nach den Modul-Pages-Renderings.

### Daten-Slots (Renderer-Input-Contract)

7. **OutroSectionInput Interface** (TypeScript)
   ```typescript
   interface V8OutroSectionInput {
     mandant: { name: string };
     strategaizeIntroParagraphs: string[]; // statisch oder via FEAT-055
     dreiHebelEmpfehlungen: Array<{
       modulName: string;
       aktuelleStufe: number;
       empfehlungText: string; // LLM-augmentiert oder deterministischer Fallback
       isLlmAugmented: boolean; // Audit-Feld
     }>;
     videoPlaceholder: { variant: "logo-tagline" | "brand-block" };
     cta: {
       href: string; // PDF: Magic-Link-URL; Web: dashboard-Pfad
       label: string; // "Mit Strategaize sprechen"
       isMagicLink: boolean;
     };
   }
   ```

### Tonalitaets-Konsistenz

8. **Strategaize-Wir-Voice durchgehend** (Default V8.0-Tonalitaet)
   - "Wir bei Strategaize..." / "Wir holen Sie ab" / "Wir bringen die Methodik"
   - Verbot: "Ich" / "Mein Team" / "Der Founder" (Founder-Voice nur, wenn `/architecture` einen Hybrid-Modus zulaesst — Default Nein)
   - Tonality-Audit-Skript `scripts/tonalitaet-audit-v8.mjs` erweitern um V8.1-Outro-Texte als Scope.

## Out of Scope

- CTA-Mechanik (Token-Generierung, Click-Handler, Email-Trigger) — siehe FEAT-068
- LLM-Augmentation der Empfehlungs-Texte — siehe FEAT-069
- Echtes Video (Hosting, Player, Stream) — V8.2+
- Pricing-Hinweise im Outro — explizit nie ("kommt erst nach persoenlichem Gespraech")
- Founder-Voice-Variante — Default Strategaize-Wir-Voice, kein Hybrid in V8.1
- A/B-Testing des Outro-Wordings — V8.2+ (FEAT-058 Diagnose-Funnel-Telemetrie ist Daten-Foundation)
- Re-Design der V8.0-CtaPage — V8.1 ergaenzt, ersetzt nicht (es sei denn, /architecture Q-V8.1-E entscheidet anders)
- Multi-Sprach-Variante (NL/EN) — V8.2+

## Constraints

- **Strategaize-Wir-Voice Pflicht** (Default V8-Tonalitaet, Konsistenz zur restlichen V8.0)
- **@react-pdf v4 Limitierungen** (siehe Memory-Files: kein rgba-Alpha, kein SVG-Image, kein null-in-Style-Array, Image-needs-Buffer)
- **Pflicht-Reuse V8.0-Theme** (COLOR + SPACING aus `mandanten-report-v2/theme.ts`)
- **Strategaize-Pattern-Reuse Pflicht** (siehe `.claude/rules/strategaize-pattern-reuse.md`): kein neuer Renderer-Stack, kein neuer Font, keine neue PDF-Dependency.
- **selectThreeHebel-Reuse** aus `src/lib/sui-engine` (Pure-Function, existiert seit SLC-148 MT-4)
- **Tonality-Audit-Erweiterung** muss gegen Coolify-DB lauffaehig sein.

## Risks / Assumptions

- **R1**: Strategaize-Vorstellungs-Text muss redaktionell vom Founder freigegeben werden vor Render-Implementierung. Ohne freigegebenen Text kann kein Smoke-PDF generiert werden. (Pre-Slice-Aufgabe in /slice-planning.)
- **R2**: V8.0-CtaPage-Position-Kollision mit V8.1-Outro — wenn V8.1-Outro VOR V8.0-CtaPage rendert, koennten beide CTAs gleichzeitig sichtbar sein (Mandant verwirrt). /architecture Q-V8.1-E muss entscheiden: Outro ersetzt CtaPage oder Outro ist davor und CtaPage wird in V8.1 modifiziert.
- **A1**: selectThreeHebel-Output existiert in `capture_session.metadata.v8_report_snapshot.drei_hebel` (V8.0 cached deterministisch) — Renderer kann daraus lesen.
- **A2**: partner_organization.contact_email + partner_organization.metadata.default_template_slug sind reliable populated (V6+V7-Migrationen erledigt).
- **A3**: Web-Bericht-Pfad `src/app/dashboard/diagnose/[id]` ist V8.0-deployed und ergaenzt-faehig.

## Success Criteria

- AC-FEAT-067-1: PDF-Outro-Section rendert in Smoke-PDF mit allen 4 Bloecken (Strategaize-Vorstellung + 3 Empfehlungen + Video-Platzhalter + CTA-Slot).
- AC-FEAT-067-2: V8-Web-Bericht zeigt Outro-Section visuell konsistent mit PDF-Outro (gleiche Bloecke, gleiche Tonalitaet).
- AC-FEAT-067-3: 3 Empfehlungs-Cards zeigen die 3 niedrigsten Module aus selectThreeHebel-Output (deterministischer Fallback bei FEAT-069-LLM-Fail).
- AC-FEAT-067-4: Tonality-Audit-Skript erweitert um V8.1-Outro-Scope und liefert 0 Treffer auf Blacklist (kein "Ich" / "Mein Team" / "Der Founder").
- AC-FEAT-067-5: Video-Block-Platzhalter rendert in PDF + Web mit Strategaize-Brand-Visual (kein leeres Box).
- AC-FEAT-067-6: V8.0-CTA-Page-Co-Existenz oder Replacement-Entscheidung aus /architecture umgesetzt ohne visuelle Doppel-CTA.
- AC-FEAT-067-7: Smoke-PDF-Total-Pages-Count entspricht /architecture-Plan (entweder 17+2 = 19 wenn Outro davor, oder 17+0 = 17 wenn Outro ersetzt CtaPage).
- AC-FEAT-067-8: TypeScript-Build EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.

## Open Questions (fuer /architecture V8.1)

- **Q-V8.1-A**: LLM-Augmentation Caching-Strategie? Pro capture_session als JSONB-Cache oder pro Render-Cycle frisch? (siehe FEAT-069)
- **Q-V8.1-E**: Outro-Section Position im PDF — vor V8.0-CtaPage (16-17) oder ersetzt sie? Wenn ersetzt: CtaPage geht ganz raus oder wird in V8.1-Hero verwoben?
- **Q-V8.1-F**: Empfehlungs-Block-Visual-Style im PDF — analog V8.0-Hebel-Block (Page 14 als Drei-Spalten oder Drei-Cards) oder neuer Verkaufs-Style (groesseres Visual, prominenterer CTA pro Card)?
