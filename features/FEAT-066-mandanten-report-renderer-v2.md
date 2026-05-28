# FEAT-066 — 17-Seiten-Premium-Mandanten-Report-Renderer V2

**Version:** V8
**Status:** planned
**Created:** 2026-05-28
**Related Slice:** SLC-150 + SLC-151 (Phase A + Phase B; to be planned in /slice-planning V8)

## Purpose

Liefert den **neuen Mandanten-Report-Renderer V2** fuer die V8 Teaser-Diagnose. Layout-Master ist `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (freigegeben 2026-05-28, 1403 Zeilen, 17 Seiten A4).

Der existierende V7.2 Renderer (`src/lib/pdf/diagnose-report.tsx` mit `@react-pdf/renderer`, 131 Zeilen) bedient V6.3 `partner_diagnostic_v1` (6 Blocks, ScoreVisualPdf + BlockSectionPdf, einfache Section-Liste). Er bleibt unveraendert fuer V6.3-Use-Cases. V8 braucht einen substantiell komplexeren Renderer:

- **17 Seiten A4-Premium-Layout** (4-Monate-Agentur-Standard, [[feedback-design-premium-look-pflicht]])
- **Modul-Profil-Wheel** als zentrales visuelles Element (SVG mit 9 Modul-Segmenten, gerendert oder als Bitmap)
- **9 Modul-Pages** mit fokussiertem Wheel-Segment (scale 1.14 + Drop-Shadow) links + 3-Sektionen-Text rechts
- **Hausaufgaben-Page** (Modul 0 strukturiert)
- **3-Strategie-Hebel-Page** mit konkreten Naechste-Schritte-Empfehlungen
- **Reflexion-Page** (Modul 10 als Zitat-Sammlung)
- **CTA-Folgegespraech-Page** als Conversion-Hebel

## Problem

- `@react-pdf/renderer` hat eingeschraenkte SVG-Unterstuetzung — das Modul-Profil-Wheel (komplexes SVG mit 9 rotierten Segmenten, Labels, scale-Transformations, Drop-Shadow) ist nicht trivial portierbar.
- HTML-zu-PDF (Puppeteer / Playwright headless / `@react-pdf/renderer` v3) waere fuer Layout-Treue zur Master-Vorlage einfacher, bringt aber neue Dependency + Bundle-Risiko + Cold-Start-Latenz im Worker.
- Tonalitaet "Unsere Empfehlung" muss in allen 90+ Stufen-Lookup-Texten konsistent sein — Risiko von "Wir empfehlen / Ihr Berater empfiehlt / Der Steuerberater empfiehlt"-Drift.
- Pflicht zur Master-Vorlagen-Treue: jede Iteration am Renderer muss visuell gegen HTML-Prototyp validierbar sein.

## In Scope

### Phase A (SLC-150) — Renderer-Foundation
1. **PDF-Engine-Auswahl** (Q-V8-A entscheidet):
   - Option A: `@react-pdf/renderer` beibehalten, Wheel als pre-rendered PNG-Asset embedden
   - Option B: Wechsel auf Puppeteer/Playwright headless mit HTML-zu-PDF, Wheel als Inline-SVG
   - Option C: Hybrid (Foundation + Text in @react-pdf, Wheel als puppeteer-generiertes PNG-Asset)
2. **Renderer-Architektur** als neuer Eintrittspunkt `renderMandantenReportV2Pdf(data)` → `Promise<Buffer>`
3. **Cover-Page** (Page 1): Cover-Titel-Pitch ("Wo Ihre Firma heute steht — und was als Naechstes zaehlt"), Logo-Slot (StB-Branding), Mandant-Name + Datum, Wheel-Hintergrund-Watermark
4. **SUI-Hero-Page** (Page 2): SUI-Score gross zentral (z.B. "67"), Klassifizierungs-Label + Farbe, Klassifizierungs-Pitch-Text aus FEAT-065 classifySui-Output
5. **Modul-Profil-Page** (Page 3): Wheel zentral (alle 9 Module sichtbar, Score-Werte als Segment-Fuellung), Legende rechts oder unten
6. **Wheel-Komponente** als isolierter Renderer-Sub-Component — Pflicht-Reuse-faehig in Modul-Pages mit fokussiertem Segment

### Phase B (SLC-151) — Modul-Pages + End-Sektionen
7. **9 Modul-Pages** (Pages 4-12) je 1 A4-Seite mit:
   - Links: Wheel mit fokussiertem Modul-Segment (scale 1.14 + Drop-Shadow)
   - Rechts: "Worum es geht" (Modul-Botschaft aus FEAT-063) + "Was es in Ihrer Firma bedeutet" (Stufen-Lookup-Text basierend auf Modul-Stufe aus FEAT-065) + "Unsere Empfehlung" (Stufen-Lookup-Text)
   - Modul-Score als kleine Anzeige
8. **Hausaufgaben-Page** (Page 13): Modul 0 Findings strukturiert — Pro Hygiene-Frage mit Status Nein/Teilweise: Frage-Text + kurze Erlaeuterung (statisch oder LLM-augmentiert per Q-V8-E)
9. **3-Strategie-Hebel-Page** (Page 14): Drei Hebel-Bloecke (aus FEAT-065 Hebel-Auswahl) mit Modul-Name + Score + konkretem Naechste-Schritte-Block
10. **Reflexion-Page** (Page 15): Modul 10 Antworten als Zitat-Sammlung — gestylt wie Quotation-Block, nicht als Frage-Antwort-Liste
11. **CTA-Folgegespraech-Page** (Page 16-17): Pflicht-CTA-Block "Folgegespraech zur Uebergabe-Strategie" mit StB-Kontakt-Info-Slot + Strategaize-Footer

### Cross-Phase
12. **PDF-Output** mit Quality: 17 Seiten A4, deutsche Sprache, Druck-fertig (300dpi-Aequivalent fuer Bitmap-Assets), Inhaltsverzeichnis im PDF-Metadaten
13. **Tonalitaets-Konsistenz-Audit** als Lint-Skript oder Test:
    - Grep aller "empfehl*"-Stellen in Output → Manuelle Pruefung oder Regex-Lint
    - Verbot: "Wir empfehlen Ihnen" ohne Kontext, "Ihr Steuerberater empfiehlt", "der Berater"
    - Pflicht: "Unsere Empfehlung" (Strategaize-Sicht direkt)
14. **Bericht-Email-Integration** — V7.2 `sendDiagnoseReportByEmail` (FEAT-060) erkennt Template-Variante und ruft `renderMandantenReportV2Pdf` statt V7.2-Renderer

## Out of Scope

- **StB-Partner-Branding** (Logo + Farben pro Partner) im PDF — V8.1+, Reuse V6 Partner-Branding-Pattern (FEAT-044) als Grundlage
- **Mehrsprachige Outputs** (NL/EN) — V8.1+
- **Editierbarkeit Bericht-Inhalt** (EditableText fuer Stufen-Lookup-Texte) — V8.1+
- **Verlaufsbeobachtung** (zweiter SUI mit Diff-Ansicht) — V8.2+
- **Interaktive Web-Variante** des Reports — separate Iteration nach PDF-Renderer-Erfolg
- **Voll-LLM-Augmentation** (alle 90+ Stufen-Texte werden personalisiert) — V8.1+, Default deterministisch
- **PDF-Annotations / Comments** — out
- **Druck-Schnitt-Marken** — Standard-A4 reicht, keine professionelle Druck-Vorbereitung
- **Replace V7.2-Renderer fuer V6.3-Variante** — strikt no-touch

## Acceptance Criteria

### Phase A
- **AC-1 PDF-Engine-Entscheidung dokumentiert**: ADR (DEC-XXX) in /architecture V8 zeigt Wahl der Engine mit Begruendung.
- **AC-2 Renderer-Foundation lebt**: `renderMandantenReportV2Pdf({mandantData, scoreData, hebel, hausaufgaben, reflexion})` → Buffer, mit Cover + SUI-Hero + Modul-Profil-Page funktional.
- **AC-3 Wheel-Komponente funktional**: Sub-Component rendert 9 Modul-Segmente mit Score-Fuellung; isoliert reuse-faehig fuer Modul-Pages.
- **AC-4 Visual-Vergleich Phase A**: PNG-Snapshots der 3 Phase-A-Pages werden gegen HTML-Prototyp gespiegelt (visuell akzeptiert, nicht pixel-perfect).

### Phase B
- **AC-5 9 Modul-Pages gerendert**: Jede Page hat fokussiertes Wheel-Segment + 3-Sektionen-Text korrekt aus Stufen-Lookup (FEAT-063) basierend auf Modul-Stufe (FEAT-065).
- **AC-6 Hausaufgaben-Page funktional**: Alle Hygiene-Findings mit Status Nein/Teilweise gerendert. Bei 0 Findings: alternative Gratulations-Page (statt leerer Seite).
- **AC-7 3-Strategie-Hebel-Page funktional**: Drei Hebel-Bloecke mit Modul-Name + Score + Empfehlungs-Text gerendert.
- **AC-8 Reflexion-Page funktional**: Modul 10 Antworten als Zitate. Bei leeren Reflexionen: alternative Pitch-Page mit Hinweis "Reflexion offen — diskutieren wir im Folgegespraech".
- **AC-9 CTA-Folgegespraech-Page funktional**: StB-Kontakt-Info-Slot gerendert (aus Partner-Org-Daten), Strategaize-Footer Pflicht.

### Cross-Phase
- **AC-10 Tonalitaets-Audit PASS**: 0 Vorkommnisse von "Ihr Steuerberater" / "der Berater" / "wir empfehlen" ohne Strategaize-Sicht-Kontext. Audit per Skript oder manueller Pruefung dokumentiert.
- **AC-11 Visual-Akzeptanz**: Founder-Pruefung des End-to-End-PDFs gegen HTML-Prototyp ergibt Akzeptanz "wie Mandanten-Report-Prototyp 2026-05-28". Nicht pixel-perfect, aber substanziell identische Wirkung.
- **AC-12 Premium-Look-Verdict**: Vertraulicher Founder-Test "Wuerde ich das einem StB schicken?" → Ja. [[feedback-design-premium-look-pflicht]] erfuellt.
- **AC-13 Email-Versand integriert**: FEAT-060-Server-Action erkennt V8-Template-Sessions und nutzt V2-Renderer.
- **AC-14 Live-Smoke End-to-End**: Founder-Test-Mandant durchlaeuft komplette Diagnose, erhaelt PDF per Email, oeffnet PDF auf Mobile + Desktop, validiert visuell + inhaltlich. Smoke-Report dokumentiert in /qa.

## Technical Notes

- Bestehender V7.2 Renderer (`src/lib/pdf/diagnose-report.tsx`) bleibt unveraendert fuer V6.3-Konsum
- Neuer V8-Renderer in `src/lib/pdf/mandanten-report-v2/` als Folder-Modul mit Sub-Components (cover.tsx, sui-hero.tsx, modul-profil.tsx, modul-page.tsx, wheel.tsx, hausaufgaben.tsx, hebel.tsx, reflexion.tsx, cta.tsx)
- Bei Q-V8-A=Puppeteer-Wahl: neue Dependency `puppeteer-core` oder `@sparticuz/chromium` fuer headless-Chrome im Coolify-Container, Bundle-Impact zu pruefen
- Bei Q-V8-A=@react-pdf/Wheel-PNG: Pre-Render-Pipeline fuer Wheel-Assets (z.B. als Build-Time-Asset oder Run-Time-PNG via satori + sharp)
- Phase A + Phase B als zwei aufeinander aufbauende Slices wegen Komplexitaet ([[feedback-slice-phase-a-b-split-for-large-slices]])
- Realistische Aufwand-Schaetzung: Phase A ~8-12h (Engine-Setup + Wheel + 3 Pages), Phase B ~8-12h (9 Modul-Pages + 4 End-Sections + Tonalitaets-Audit)

## Cross-References

- **Quelle:** `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (Layout-Master, 1403 Zeilen, 17 Seiten)
- **Quelle:** `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_WEB.html` (Web-Variante, V8.1+ Referenz)
- **Reuse-Pattern:** V7.2 FEAT-060 PDF-Renderer + ScoreVisualPdf + Email-Versand (Server-Action bleibt, Renderer-Branch additiv)
- **Konsumiert:** FEAT-063 (Stufen-Lookup-Daten), FEAT-065 (Score + Stufe + Hausaufgaben + Reflexion + Hebel-Auswahl)
- **Bezug:** [[feedback-design-premium-look-pflicht]] — Premium-Look Pflicht
- **Bezug:** [[feedback-mandanten-empfehlung-unsere-nicht-stb]] — Tonalitaet "Unsere Empfehlung"
- **Bezug:** [[feedback-style-guide-v2-mandatory]] — Style Guide V2
- **Bezug:** [[feedback-slice-phase-a-b-split-for-large-slices]] — Phase-A/B-Split bei grossen Slices
- **Bezug:** [[feedback-deferred-live-smoke-completion]] — Live-Smoke vor /qa-PASS
