# SLC-150 — Renderer Phase A (Foundation + Wheel + Cover + SUI-Hero + Modul-Profil)

**Version:** V8
**Feature:** FEAT-066 Phase A (17-Seiten-Premium-Mandanten-Report-Renderer V2)
**Backlog:** BL-131
**Status:** planned
**Created:** 2026-05-29
**Priority:** High
**Estimate:** ~8-12h Code-Side + Spike-Klausel (~1-2h MT-1 mit Pivot-Risiko ~3-4h zu Hybrid)
**Worktree Branch:** `v8-mandanten-report` (Cumulative-Single-Branch — selbe Branch wie SLC-148/149, siehe SLC-148 Branch-Strategie)

## Slice Goal

Liefert die **Renderer-Foundation + Wheel-Komponente + die ersten 3 PDF-Pages** fuer den V8 Mandanten-Report V2 nach Master-Vorlage `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html`.

Nach diesem Slice existiert:

1. **Folder-Modul** `src/lib/pdf/mandanten-report-v2/` mit Theme-Tokens, Custom-Fonts-Setup, Renderer-Eintrittspunkt `renderMandantenReportV2Pdf(input)` -> `Promise<Buffer>`.
2. **Wheel-Komponente** `Wheel.tsx` als @react-pdf `<Svg>`-Component basierend auf `computeWheelPaths` (Pure-Function aus SLC-148 MT-5, DEC-162). Reuse-faehig fuer Phase B Modul-Pages (focusIdx-Variante).
3. **Page 1 Cover** mit Hero-Pitch ("Wo Ihre Firma heute steht — und was als Naechstes zaehlt"), Mandant-Name + Datum-Slot, dezentem Wheel-Watermark-Hintergrund.
4. **Page 2 SUI-Hero** mit zentralem SUI-Score (z.B. "67"), Klassifizierungs-Label + Farbe, Klassifizierungs-Pitch-Text aus `classifySui`-Output.
5. **Page 3 Modul-Profil** mit Wheel zentral (alle 9 Module sichtbar, Score-Werte als Segment-Fuellung) + Modul-Legende (rechts oder unten) mit Modul-Namen + Score-Indikatoren.
6. **Spike-Decision-Output** (MT-1): Founder-Visual-Akzeptanz-Verdict zu @react-pdf Wheel-Render — Plan-A continue ODER dokumentierter Pivot zu Plan-B (Hybrid satori+sharp PNG-Wheel) per DEC-157 Spike-Klausel.

**KEINE Modul-Pages** (Pages 4-12) — gehoeren in SLC-151.
**KEINE Hausaufgaben/Hebel/Reflexion/CTA** — gehoeren in SLC-151.
**KEINE Email-Versand-Integration** — gehoert in SLC-152.

## In Scope

- Folder-Setup `src/lib/pdf/mandanten-report-v2/` mit Sub-Module-Struktur (theme.ts, fonts.ts, renderer.tsx, wheel.tsx, pages/cover.tsx, pages/sui-hero.tsx, pages/modul-profil.tsx)
- Custom-Fonts-Registrierung via `Font.register()` (Fraunces + JetBrains Mono — Font-Files lokal in `public/fonts/` ablegen, NICHT Google-CDN per Cold-Start-Risk im Worker)
- `RendererInput`-Type basierend auf `V8ReportSnapshot` aus SLC-148 (siehe `src/lib/diagnose/types.ts`) + Mandant-Metadaten (Name, Datum, StB-Org-Slot fuer Cover-Footer)
- `renderMandantenReportV2Pdf(input): Promise<Buffer>` als alleiniger Eintrittspunkt — Sub-Pages werden hier zusammengesetzt
- Wheel-Komponente konsumiert `computeWheelPaths(moduleScores, options)` aus `src/lib/diagnose/wheel-paths.ts` (SLC-148 MT-5)
- Theme-Tokens als Konstanten (Farben, Spacing, Typography-Sizes) — keine Tailwind-Klassen in @react-pdf
- 3 Pages mit konsistenter A4-Page-Struktur (Header? Footer? Margins?)
- Vitest fuer Pure-Logic-Helpers (kein @react-pdf-Render-Test, weil zu schwer mockbar — Visual-Verifikation in MT-7)
- Visual-Smoke-Script (Node-Skript) das `renderMandantenReportV2Pdf` mit Fixture-Snapshot aufruft und PDF in `/tmp/v8-mandanten-report-smoke.pdf` schreibt fuer Founder-Visual-Inspect

## Out of Scope

- **9 Modul-Pages** (Pages 4-12) — SLC-151 MT-1+MT-2
- **Hausaufgaben-Page** (Page 13) — SLC-151 MT-3
- **3-Strategie-Hebel-Page** (Page 14) — SLC-151 MT-4
- **Reflexion-Page** (Page 15) — SLC-151 MT-5
- **CTA-Folgegespraech-Page** (Pages 16-17) — SLC-151 MT-6
- **Tonalitaets-Audit-Skript** — SLC-151 MT-7 (post Phase-B-Inhalts-Komplettheit)
- **FEAT-060 Email-Versand-Branch** mit Template-Variant-Switch — SLC-152
- **Telemetrie-Events** `report_generated` + `email_sent` — SLC-152
- **Bericht-Pending-Page Frontend-Snapshot-Reader** — SLC-152
- **StB-Partner-Branding** (Logo + Farben pro Partner) — V8.1+ (Cover-Page hat nur Slot-Platzhalter)
- **EditableText fuer PDF-Texte** — V8.1+ (PDF-Output ist Server-Side-only, kein EditableText-Mechanismus)
- **Mehrsprachige Outputs** (NL/EN) — V8.1+

## Pre-Conditions

- ✓ SLC-148 done (`computeWheelPaths` Pure-Function LIVE, `V8ReportSnapshot`-Type definiert, `classifySui`-Output verfuegbar)
- ✓ SLC-149 done (Frontend-Components LIVE, Foundation fuer V8-Run-Flow exists)
- ✓ DEC-157 Spike-Klausel akzeptiert (Pivot-Trigger ist "Founder-Visual-Akzeptanz fail bei MT-1-Wheel-Demo", NICHT "etwas anders" / "nicht pixel-perfect")
- ✓ DEC-162 Wheel via @react-pdf `<Svg>` mit Pure-Function Pfad-Berechnung — `computeWheelPaths` ist Single-Source-of-Truth fuer Path-D-Strings
- ✓ Master-Vorlage `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` freigegeben (2026-05-28, 17 Seiten A4)
- ✓ `@react-pdf/renderer` `^4.5.1` in package.json installiert (verified Pre-Flight 2026-05-29)
- ✓ Worktree `v8-mandanten-report` HEAD aktiv (SLC-148/149 Commits b7ce89f)

## Spike-Klausel (DEC-157 — Pflicht in MT-1)

Der Founder hat in /architecture V8 zwei Pfade dokumentiert:

- **Plan A (default)**: `@react-pdf/renderer` mit Inline-`<Svg>` + Custom-Fonts via `Font.register()`. Kein neuer Production-Dependency. Wheel via `computeWheelPaths` Pure-Function (DEC-162).
- **Plan B (Pivot)**: Hybrid `@react-pdf + satori + sharp` — Text via @react-pdf, Wheel pre-rendered als PNG-Buffer via `satori` (HTML/CSS-to-SVG) + `sharp` (SVG-to-PNG), embedded als `<Image>` in @react-pdf.

**Pivot-Trigger** (DEC-157 voll-zitiert):
> "Wenn der Founder-Visual-Akzeptanz-Vergleich gegen den HTML-Prototyp nicht bestanden wird, dokumentierter Pivot zu Option C (Hybrid). Pivot-Aufwand ~3-4h, addiert zu SLC-150 Phase-A-Budget."

**NICHT-Pivot-Trigger** (DEC-157 explizit ausgeschlossen):
> "Pivot-Trigger ist 'Founder-Visual-Akzeptanz fail' bei MT-1-Wheel-Demo, NICHT 'etwas anders' oder 'nicht pixel-perfect'."

**Konkrete Pivot-Entscheidungskriterien fuer MT-1 Founder-Verdict:**

| Founder-Befund | Aktion |
|---|---|
| Wheel rendert sauber, Farben korrekt, Sektoren visuell sauber → "passt" | Plan A continue ohne Pivot |
| Wheel rendert mit minimalen Render-Artefakten (z.B. leicht versetzte Labels, Aliasing) | Plan A continue + Polish-BL-Item fuer V8.1 |
| Drop-Shadow / Filter-Effekte fehlen (DEC-157 antizipiert) | Plan A continue — Drop-Shadow ist dekorativ, kein Methodik-Substanz-Verlust |
| @react-pdf SVG-Path-Renderer kann `pathD` aus `computeWheelPaths` nicht zuverlaessig zeichnen (Parse-Fehler, broken Sektoren, Crashes) | **Pivot zu Plan B** |
| Wheel zeigt fundamentale Layout-Fehler (z.B. Sektoren ueberlappen, Center nicht da, Farben nicht von computeWheelPaths) | **Pivot zu Plan B** |

**Wenn Pivot triggert**:
1. MT-1-Output: `docs/V8_RENDERER_PIVOT_PLAN_B.md` mit Founder-Verdict + Begruendung + Plan-B-Setup-Notes
2. MT-2..MT-7 werden um Plan-B-Aufwand erweitert (~3-4h fuer satori+sharp-Setup + Wheel-PNG-Generation + @react-pdf `<Image>`-Embed)
3. DECISIONS.md neuer Eintrag DEC-XXX "SLC-150 Pivot zu Plan B" mit Status `accepted`, supersedes-Beziehung zu DEC-157 (DEC-157 Spike-Klausel hat sich aktiviert)
4. Slice-Estimate fuer SLC-150 wird im Slice-File auf ~12-16h hochrevidiert + commit auf v8-mandanten-report-Branch
5. Plan-B-Implementierung: neue Dependencies `satori@^0.10` + `sharp@^0.33` in package.json, Bundle-Impact dokumentiert

## Micro-Tasks

### MT-1: PDF-Engine-Spike — Wheel-Demo-PDF + Founder-Visual-Verdict [DONE 2026-05-29]
- **Goal**: Erste minimale @react-pdf-Implementation der Wheel-Komponente. PDF mit nur Wheel-Page erzeugen, lokal oeffnen, Founder-Visual-Vergleich gegen `MANDANTEN_REPORT_PROTOTYP.html` Seite 3 (Modul-Profil-Wheel).
- **Decision (2026-05-29 Founder-Verdict)**: **Plan A continue.** Engine ist verifiziert. Variante 1 rendert sauber mit korrekter Score-abhaengiger Geometrie + 3-Farb-Klassifizierung. Variante 2 hatte Alpha-Rendering-Bug (`rgba(..., 0.3)` rendert in @react-pdf v4 als unerwartete Sekundaer-Farben statt Pastel) — **In MT-1 selbst gefixt** via pre-multiplied Alpha in `wheel-paths.ts` (`rgba(r, g, b, 0.3)` -> `rgb(r*0.3+255*0.7, ...)` Pastel-Konstanten). 18/18 wheel-paths Vitest GREEN nach Fix. Custom-Fonts entkoppelt zu MT-2/MT-3 (Default-Helvetica fuer Spike ausreichend).
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/wheel.tsx` (NEU) — Wheel-Komponente als @react-pdf `<Svg>` mit `<Path d={pathD} fill={fillColor} />` pro WheelPath
  - `src/lib/pdf/mandanten-report-v2/theme.ts` (NEU) — Color-Konstanten (rot/amber/gruen Hex/RGB, Background, Text-Farben) als @react-pdf-kompatible Strings
  - `src/lib/pdf/mandanten-report-v2/fonts.ts` (NEU) — `Font.register()`-Aufrufe fuer Fraunces + JetBrains Mono (lokale Font-Files aus `public/fonts/`)
  - `public/fonts/Fraunces-Regular.ttf` + `public/fonts/Fraunces-Bold.ttf` + `public/fonts/JetBrainsMono-Regular.ttf` (NEU als Asset-Downloads — siehe MT-1 Pre-Step)
  - `scripts/spike-v8-wheel-demo.mjs` (NEU) — Standalone-Node-Skript: Loaded `computeWheelPaths` + Wheel-Component, ruft `renderToBuffer` mit einer Test-Score-Profil-Fixture, schreibt PDF nach `/tmp/v8-spike-wheel.pdf`
- **Pre-Step (Asset-Downloads, ~10min)**:
  - Download Fraunces TTF + JetBrains Mono TTF von Google Fonts (https://fonts.google.com/specimen/Fraunces, https://fonts.google.com/specimen/JetBrains+Mono)
  - 3 Files in `public/fonts/` ablegen (Regular + Bold + Mono-Regular minimum)
  - Sicherheits-Check: TTF nicht WOFF/WOFF2 (@react-pdf v4 unterstuetzt TTF zuverlaessig, WOFF nicht durchgehend)
  - `.gitignore`-Audit: keine Wildcard-Exclude fuer `public/fonts/*.ttf` (Font-Files muessen committed werden fuer Server-Side-PDF-Render)
- **Expected Behavior**:
  - `Wheel`-Component-Props: `{ moduleScores: ModuleScores, focusIdx?: number, radius?: number, centerX?: number, centerY?: number }` — Defaults aus DEC-162 (radius=80, centerX=100, centerY=100 → 200×200 Viewport)
  - Render: `<Svg viewBox="0 0 200 200" width={200} height={200}><Path d={pathD} fill={fillColor} /></Svg>` fuer alle 9 Pfade aus `computeWheelPaths`
  - Optional: Score-Labels als `<Text>` neben jedem Sektor (Pure-Function `getLabelPosition` aus DEC-162 — Renderer berechnet selbst, NICHT in `computeWheelPaths`)
  - Spike-Skript: Mock-Score-Profil `{m1: 8, m2: 2, m3: 5, m4: 2, m5: 9, m6: 3, m7: 7, m8: 4, m9: 6}` (asymmetrisch, alle 3 Farben sichtbar)
  - `node scripts/spike-v8-wheel-demo.mjs` erzeugt `/tmp/v8-spike-wheel.pdf` ohne Fehler
  - Founder oeffnet PDF in PDF-Viewer + vergleicht visuell mit MANDANTEN_REPORT_PROTOTYP.html Page 3 Modul-Profil-Wheel
- **Founder-Verdict-Pflicht** (Spike-Decision):
  - **Wenn PASS**: MT-1-Output-Commit mit Foto/Screenshot des Demo-PDF im PR-Diff-Header + Verdict-Note "Plan A continue"
  - **Wenn FAIL**: Pivot-Workflow starten (siehe Spike-Klausel oben)
- **Verification**:
  - `node scripts/spike-v8-wheel-demo.mjs` erzeugt ein gueltiges PDF
  - `ls -lh /tmp/v8-spike-wheel.pdf` zeigt Datei mit non-zero size (>=10KB)
  - `file /tmp/v8-spike-wheel.pdf` zeigt `PDF document, version 1.x`
  - PDF oeffnet in Browser/PDF-Viewer ohne Render-Error
  - Founder-Verdict dokumentiert (PR-Description oder MT-1-Report)
- **Dependencies**: SLC-148 MT-5 (`computeWheelPaths` LIVE), `@react-pdf/renderer` ^4.5.1
- **Spike-Aufwand**: ~1-2h (Standard), bei Pivot +3-4h fuer Plan-B-Setup

### MT-2: Renderer-Foundation + RendererInput-Type + Theme-Tokens
- **Goal**: Eintrittspunkt `renderMandantenReportV2Pdf(input)` + Theme-Konsistenz + Type-Definition fuer den vollstaendigen Renderer-Input.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/types.ts` (NEU) — `RendererInput`-Type + Sub-Types (`MandantInfo`, `StbInfo`, `RenderOptions`)
  - `src/lib/pdf/mandanten-report-v2/renderer.tsx` (NEU) — Top-Level-Komponente `<MandantenReportV2Document>` + Eintrittspunkt-Function `renderMandantenReportV2Pdf`
  - `src/lib/pdf/mandanten-report-v2/theme.ts` (additiv aus MT-1) — Spacing-Tokens + Typography-Sizes ergaenzen
  - `src/lib/pdf/mandanten-report-v2/index.ts` (NEU) — Public-API-Export-Punkt
- **Expected Behavior**:
  - `RendererInput` aggregiert: `{ snapshot: V8ReportSnapshot, mandant: { name: string, datum: string }, stb?: { firma: string, kontakt_email: string }, options?: { includeWatermark?: boolean } }`
  - `renderMandantenReportV2Pdf(input): Promise<Buffer>` ruft `@react-pdf/renderer`'s `renderToBuffer(<MandantenReportV2Document {...input} />)` auf
  - `<MandantenReportV2Document>` rendert `<Document>` mit `<Page size="A4">`-Children fuer Cover + SUI-Hero + Modul-Profil (MT-4/5/6) — Phase-A nur diese 3 Pages, Phase-B-Pages werden in SLC-151 hinzugefuegt
  - Theme-Tokens als Konstanten (z.B. `theme.colors.brand.primary = "rgb(15, 23, 42)"`, `theme.spacing.page.margin = 40`, `theme.typography.heading1.size = 36`)
  - Fonts werden in `renderer.tsx` via `import './fonts'` registriert (Side-Effect-Import)
- **Verification**:
  - Vitest: Type-Check ueber `RendererInput`-Fixture (V8ReportSnapshot mit allen 9 Modulen + Klassifizierung + 5 Hausaufgaben + 5 Reflexionen + 3 Hebel)
  - Skript: `node scripts/spike-v8-wheel-demo.mjs` erweitert auf vollstaendigen Renderer-Call (auch wenn Pages noch leer) — erzeugt 3-Seiten-PDF mit nur Wheel auf Page 3 als Smoke-Test
- **Dependencies**: MT-1 (Wheel + Fonts + Theme)

### MT-3: Page 1 Cover — Hero-Pitch + Mandant-Slot + Datum + Wheel-Watermark
- **Goal**: Cover-Seite (Page 1) gemaess MANDANTEN_REPORT_PROTOTYP.html Page 1.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/cover.tsx` (NEU) — `<CoverPage>` Component
  - `src/lib/pdf/mandanten-report-v2/components/watermark-wheel.tsx` (NEU) — Wheel-Variante mit `opacity: 0.08` als Hintergrund
- **Expected Behavior**:
  - A4-Seite mit grossem zentralen Pitch: "Wo Ihre Firma heute steht — und was als Naechstes zaehlt" (Hero-Titel)
  - Sub-Title-Slot: "Strategaize Uebergabefaehigkeits-Diagnose"
  - Mandant-Name + Datum aus `input.mandant` (z.B. "Erstellt fuer: {mandant.name} • {mandant.datum}")
  - Footer-Slot mit StB-Firma falls `input.stb` gesetzt (sonst Strategaize-Default)
  - Hintergrund: `<WatermarkWheel moduleScores={snapshot.moduleScores} />` mit 30%-Opazitaet, leicht versetzt unten-rechts (gemaess Prototyp)
  - Typography: Fraunces Bold fuer Hero-Titel (z.B. 42pt), Fraunces Regular fuer Sub-Title (z.B. 18pt), JetBrains Mono fuer Mandant-Datum (z.B. 10pt)
  - Page-Margins: 40pt (theme.spacing.page.margin)
- **Verification**:
  - Spike-Skript erzeugt 3-Page-PDF, Founder oeffnet Page 1 visuell und vergleicht gegen MANDANTEN_REPORT_PROTOTYP.html Page 1
  - Visual-Akzeptanz: substanzielle Vorlagen-Treue (NICHT pixel-perfect, AC-11 von FEAT-066)
- **Dependencies**: MT-2 (Renderer-Foundation)

### MT-4: Page 2 SUI-Hero — Score zentral + Klassifizierung + Pitch
- **Goal**: SUI-Hero-Seite (Page 2) gemaess MANDANTEN_REPORT_PROTOTYP.html Page 2.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/sui-hero.tsx` (NEU) — `<SuiHeroPage>` Component
- **Expected Behavior**:
  - A4-Seite mit grossem zentralen SUI-Score als Hero-Zahl: `{snapshot.sui}` (z.B. "67") — Fraunces Bold, ~120pt
  - Sub-Label: "Strategaize Uebergabefaehigkeits-Index"
  - Klassifizierungs-Badge: `{snapshot.classification.label}` mit Farbe `{snapshot.classification.color}` (rot/amber/gruen aus `theme.colors.classification.*`)
  - Klassifizierungs-Pitch-Text (Long-Form): `{snapshot.classification.meaning}` als Absatz unter dem Score (Fraunces Regular, ~14pt, Line-Height 1.5)
  - Strategaize-Signature-Footer-Element (z.B. Logo-Slot oder Mini-Wheel als Brand-Anchor)
- **Verification**:
  - Spike-Skript erzeugt PDF mit Page 2, Founder oeffnet visuell und vergleicht
  - Visual-Akzeptanz: substanzielle Vorlagen-Treue
- **Dependencies**: MT-2 (Renderer-Foundation), MT-3 (Cover-Pattern als Template fuer Page-Layout-Konsistenz)

### MT-5: Page 3 Modul-Profil — Wheel zentral + Legende
- **Goal**: Modul-Profil-Seite (Page 3) gemaess MANDANTEN_REPORT_PROTOTYP.html Page 3. Wheel mit allen 9 Modulen sichtbar (NICHT fokussiert — Fokus-Variante kommt in SLC-151 Modul-Pages).
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/modul-profil.tsx` (NEU) — `<ModulProfilPage>` Component
  - `src/lib/pdf/mandanten-report-v2/components/wheel-legend.tsx` (NEU) — `<WheelLegend>` als reusable Component fuer Modul-Namen + Score-Indikatoren
- **Expected Behavior**:
  - A4-Seite mit Page-Titel: "Ihr Modul-Profil" (Fraunces Bold, ~28pt)
  - Sub-Titel-Pitch: "Neun Module zeigen, wo Ihre Uebergabe-Faehigkeit heute steht."
  - Wheel zentral (gross, z.B. 400×400 Viewport im Renderer-Output, kein focusIdx → alle Sektoren full-Alpha)
  - Legende rechts oder unten (gemaess Prototyp-Layout): Liste der 9 Module mit:
    - Modul-Name (aus `template.blocks[].name`)
    - Modul-Score (z.B. "Modul 1: 8/10")
    - Klassifizierungs-Farbe als kleiner Indikator-Punkt
  - Modul-Namen kommen NICHT aus dem Snapshot direkt (snapshot hat nur Scores) — Renderer braucht Modul-Namen-Quelle. **Implementierungs-Entscheidung**: `RendererInput` um `moduleNames: Record<ModulKey, string>` erweitern, Caller (SLC-152 Email-Versand-Branch) populated aus `template.blocks[].name` analog `selectThreeHebel`-Pattern aus SLC-148 MT-4.
- **Verification**:
  - Spike-Skript erzeugt PDF mit Page 3, Founder oeffnet visuell und vergleicht gegen Prototyp Page 3
  - Visual-Akzeptanz: substanzielle Vorlagen-Treue
- **Dependencies**: MT-1 (Wheel), MT-2 (Renderer-Foundation)

### MT-6: Vitest-Coverage Pure-Logic-Helpers + Smoke-Skript erweitert
- **Goal**: Pure-Function-Vitest-Coverage fuer Renderer-Helpers (Theme-Lookups, Klassifizierungs-Farb-Resolver, Modul-Name-Resolver). Smoke-Skript schreibt vollstaendiges 3-Page-PDF mit Founder-Test-Fixture.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/__tests__/theme-resolvers.test.ts` (NEU) — Vitest fuer Color-Resolver + Typography-Resolver-Helpers
  - `src/lib/pdf/mandanten-report-v2/__tests__/renderer-input.test.ts` (NEU) — Vitest fuer `validateRendererInput`-Helper (Defensive-Check, dass Snapshot vollstaendig ist)
  - `scripts/spike-v8-wheel-demo.mjs` (erweitert auf vollstaendigen 3-Page-Smoke mit Fixture-Snapshot)
- **Expected Behavior**:
  - Vitest: `getClassificationColor('rot')` → korrekte RGB-Konstante; `getClassificationColor('invalid')` → wirft Error oder returns Default-Grey
  - Vitest: `validateRendererInput(incompleteInput)` → wirft konkrete Error-Message mit fehlenden Feldern; `validateRendererInput(completeInput)` → returns true
  - Smoke-Skript: `node scripts/spike-v8-wheel-demo.mjs` mit fester Fixture (z.B. SUI=67, Klassifizierung=teil_reife/amber, 9 Modul-Scores asymmetrisch) erzeugt 3-Page-PDF in `/tmp/v8-mandanten-report-phase-a-smoke.pdf`
- **Verification** (Vitest):
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-150-Scope EXIT=0
  - Vitest SLC-150-Scope alle PASS (theme-resolvers + renderer-input)
  - Smoke-Skript erzeugt nicht-zero-byte PDF
- **Dependencies**: MT-5 (alle 3 Pages implementiert)

### MT-7: Records + /qa SLC-150 + Phase-A-Visual-Founder-Verdict
- **Goal**: Project-Records updaten + /qa fuer Code-Side + Phase-A-Founder-Visual-Verdict gegen MANDANTEN_REPORT_PROTOTYP.html Pages 1-3.
- **Files**:
  - `docs/STATE.md` — Current-Focus auf SLC-150 done
  - `slices/INDEX.md` — SLC-150 status `done`, BL-131 Notes
  - `planning/backlog.json` — BL-131 bleibt `in_progress` (FEAT-066 Phase-A done, Phase-B + Integration pending in SLC-151/152)
  - `features/INDEX.md` — FEAT-066 bleibt `in_progress` (zwei Phasen + Integration)
  - `reports/RPT-XXX.md` (NEU) — Completion-Report + /qa-Report kombiniert
- **Expected Behavior**:
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-150-Scope EXIT=0
  - Vitest SLC-150-Scope + adjacent alle PASS
  - Smoke-PDF (`/tmp/v8-mandanten-report-phase-a-smoke.pdf`) erzeugt mit Test-Fixture
  - Founder oeffnet Smoke-PDF + MANDANTEN_REPORT_PROTOTYP.html Pages 1-3 side-by-side
  - Founder-Visual-Verdict: substanzielle Vorlagen-Treue Pages 1-3 PASS (AC-4 von FEAT-066)
  - Bei Visual-Issues: Hotfix-Iteration innerhalb SLC-150 (max 2 Polish-Rounds), Pivot zu Plan B nur falls fundamentale Engine-Limitation in MT-1 noch nicht erkannt
- **Verification**:
  - /qa-Report PASS code-side
  - Visual-Verdict-Note im Completion-Report mit Founder-Statement
  - Co-Existenz: V6.3 V7.2 Renderer `src/lib/pdf/diagnose-report.tsx` unveraendert (Git-Diff prueft)
- **Dependencies**: MT-6

## Acceptance Criteria (Phase A — aus FEAT-066 AC-1..4 + SLC-150-spezifisch)

- **AC-1 PDF-Engine-Entscheidung dokumentiert** (FEAT-066 AC-1): DEC-157 in /architecture V8 zeigt Wahl `@react-pdf` + Spike-Klausel. MT-1 dokumentiert Founder-Verdict (Plan A continue ODER Pivot zu Plan B).
- **AC-2 Renderer-Foundation lebt** (FEAT-066 AC-2): `renderMandantenReportV2Pdf({snapshot, mandant, stb?, moduleNames})` erzeugt 3-Seiten-Buffer ohne Crash.
- **AC-3 Wheel-Komponente funktional** (FEAT-066 AC-3): `<Wheel>` rendert 9 Modul-Segmente aus `computeWheelPaths`-Output, isoliert reuse-faehig (Test mit focusIdx=4 in Phase B vorbereitet).
- **AC-4 Visual-Vergleich Phase A** (FEAT-066 AC-4): Founder-Visual-Verdict Pages 1-3 vs. MANDANTEN_REPORT_PROTOTYP.html ergibt "substanzielle Treue" (NICHT pixel-perfect).
- **AC-SLC-150-1 Folder-Modul-Struktur**: `src/lib/pdf/mandanten-report-v2/` mit Sub-Modulen (theme, fonts, renderer, wheel, pages/) angelegt, klares Public-API ueber `index.ts`.
- **AC-SLC-150-2 Custom-Fonts registriert**: `Font.register('Fraunces', ...)` + `Font.register('JetBrains Mono', ...)` LIVE, lokale TTF-Files in `public/fonts/` committed.
- **AC-SLC-150-3 Quality-Gates**: tsc EXIT=0, ESLint EXIT=0, Vitest SLC-150-Scope PASS.
- **AC-SLC-150-4 V6.3-Renderer-Co-Existenz**: `src/lib/pdf/diagnose-report.tsx` (V7.2 Renderer fuer `partner_diagnostic_v1`) Git-Diff = 0 Aenderungen, weiterhin funktional fuer V6.3-Templates.
- **AC-SLC-150-5 Smoke-PDF erzeugt**: `node scripts/spike-v8-wheel-demo.mjs` erzeugt `/tmp/v8-mandanten-report-phase-a-smoke.pdf` mit gueltigem 3-Seiten-PDF, manuell oeffenbar.
- **AC-SLC-150-6 Spike-Klausel-Verdict**: MT-1 Founder-Verdict dokumentiert (Plan A continue ODER Pivot-Plan-B-Setup-Notes in `docs/V8_RENDERER_PIVOT_PLAN_B.md`).

## Wiring-Verification-Liste

- ✓ `computeWheelPaths` (SLC-148 MT-5) → `<Wheel>`-Component-Props (MT-1)
- ✓ `<Wheel>` reuse-faehig fuer Phase-B Modul-Pages (focusIdx-Variante) — MT-1 explizit testet ohne + mit focusIdx=4
- ✓ `V8ReportSnapshot` (SLC-148 MT-6) → `RendererInput.snapshot` (MT-2)
- ✓ `classifySui`-Output → SUI-Hero-Page Klassifizierungs-Badge (MT-4)
- ✓ `Font.register` (MT-1 fonts.ts) → `<Document>` aller Pages verwendet konsistent Fraunces + JetBrains Mono
- ✓ Theme-Tokens (MT-2 theme.ts) → Konsistenz ueber alle 3 Phase-A-Pages
- ✓ MANDANTEN_REPORT_PROTOTYP.html Pages 1-3 → Visual-Master fuer Cover + SUI-Hero + Modul-Profil
- ✓ V6.3 V7.2 Renderer `src/lib/pdf/diagnose-report.tsx` UNVERAENDERT (Co-Existenz)

## Risks / Notable Concerns

- **R-1 @react-pdf-Wheel-Render-Limitation (Spike-Trigger)**: @react-pdf hat eingeschraenkte SVG-Path-Support. Wenn `computeWheelPaths`-Pfade nicht zuverlaessig gerendert werden → Pivot zu Plan B (Hybrid satori+sharp).
  - **Mitigation**: MT-1 Spike als 1. Action, Founder-Visual-Verdict vor MT-2..MT-5. Pivot-Plan-B-Aufwand ist in Slice-Estimate eingerechnet (~3-4h).
- **R-2 Custom-Fonts laden nicht im Server-Side-Render**: @react-pdf `Font.register` kann Cold-Start-Probleme bei Lokal-TTF haben (Path-Resolution in Coolify-Container).
  - **Mitigation**: TTF-Files in `public/fonts/` mit absoluten Pfad-Imports (`import path from 'path'; path.join(process.cwd(), 'public/fonts/Fraunces-Regular.ttf')`). MT-1 Spike testet das explizit.
- **R-3 PDF-Bundle-Size-Spike**: Fraunces + JetBrains Mono TTF zusammen ~600KB-1MB. Pre-existing V7.2 Renderer hat keine Custom-Fonts → V8-Renderer fuegt Bundle-Last hinzu.
  - **Mitigation**: Akzeptierbar fuer V8 (kein Co-Locator zu Per-Request-Latenz, weil Server-Side-Render). Falls Bundle-Audit `npm run build` ueber >10MB → Subset-TTF (nur DE-Charset) als Polish-Plan-B.
- **R-4 Visual-Drift zwischen Spike-PDF und Vollstaendig-Rendered Phase-B**: Founder akzeptiert MT-1-Wheel, aber MT-3..MT-5 zeigen Layout-Issues unter Page-Margin-Komposition.
  - **Mitigation**: MT-7 Phase-A-Visual-Verdict ist Gate vor SLC-151-Start. Bei Phase-A-Fail → Hotfix in SLC-150 (max 2 Polish-Rounds), nicht Pivot.
- **R-5 RendererInput-Schema-Drift vs. SLC-148 Snapshot-Format**: `V8ReportSnapshot` ist in SLC-148 MT-4 + MT-6 definiert. Wenn der Caller-Code (SLC-152) andere Felder erwartet → Type-Drift.
  - **Mitigation**: MT-2 + MT-6 `validateRendererInput`-Defensive-Check + Vitest-Coverage gegen vollstaendige Fixture aus `src/lib/diagnose/__tests__/sui-engine.test.ts` (Reuse-Fixture).
- **R-6 Score-zu-Stufe-Mapping-Drift zwischen SUI-Engine und Renderer**: Renderer zeigt Stufen-Lookup-Texte basierend auf `snapshot.stufenMapping` — wenn Phase-B (SLC-151) Modul-Pages einen anderen Mapping-Algorithmus nutzt → Inkonsistenz.
  - **Mitigation**: `stufenMapping` ist im Snapshot Single-Source-of-Truth (SLC-148 MT-4 `mapAllModuleScoresToStufen`). Renderer NIE re-mapped, nur liest.

## Verification Strategy

- **Spike-First** (MT-1): Founder-Visual-Verdict Wheel-Demo VOR Page-Implementation. Pivot-Decision hart vor MT-2.
- **TDD jsdom-frei** (Pure-Logic-Helpers): `theme-resolvers` + `renderer-input`-Validator als Pure-Functions. Component-Render-Tests deferred zu Visual-Smoke (kein @react-pdf-Mock).
- **Visual-Smoke-Skript**: `scripts/spike-v8-wheel-demo.mjs` als CI-Artefakt-Erzeuger. Founder-Inspect statt Browser-DOM-Test.
- **Vorlagen-Treue-Vergleich**: Side-by-Side `MANDANTEN_REPORT_PROTOTYP.html` + Smoke-PDF im PDF-Viewer.
- **V6.3-Co-Existenz**: Git-Diff von `src/lib/pdf/diagnose-report.tsx` = 0 (Pflicht-Gate).

## Dependencies / Pre-Conditions Tabelle

| Pre-Condition | Status | Aktion |
|---|---|---|
| SLC-148 done | ✓ done | RPT-358 (Memory project_op_v8_slc149_done) |
| SLC-149 done | ✓ done | RPT-358 |
| @react-pdf/renderer ^4.5.1 installiert | ✓ done | package.json verified Pre-Flight 2026-05-29 |
| MANDANTEN_REPORT_PROTOTYP.html freigegeben | ✓ done | 2026-05-28 |
| DEC-157 Spike-Klausel akzeptiert | ✓ done | docs/DECISIONS.md |
| DEC-162 Wheel-Render-Strategie | ✓ done | computeWheelPaths Pure-Function aus SLC-148 MT-5 |
| Custom-Fonts TTF-Files (Fraunces + JetBrains Mono) | pending | MT-1 Pre-Step Asset-Download |
| Worktree `v8-mandanten-report` aktiv | ✓ done | HEAD b7ce89f |

## Cross-References

- **Architektur**: `docs/ARCHITECTURE.md` V8-Addendum (Implementation Direction SLC-150)
- **Feature**: `features/FEAT-066-mandanten-report-renderer-v2.md` Phase A
- **Decisions**: DEC-157 (PDF-Engine + Spike-Klausel), DEC-162 (Wheel via @react-pdf <Svg> + Pure-Function), DEC-156 (MandantHeader-Pattern), DEC-163 (Snapshot-Persistenz)
- **Reuse-Patterns**:
  - V7.2 `src/lib/pdf/diagnose-report.tsx` (Renderer-Pattern, ScoreVisualPdf, StyleSheet.create — strict unveraendert fuer V6.3-Co-Existenz)
  - V7.2 `@react-pdf/renderer` Dependency (kein neuer Production-Dep noetig in V8.0)
  - SLC-148 MT-5 `computeWheelPaths` Pure-Function (Wheel-Pfad-Berechnung)
  - SLC-148 MT-4 `classifySui` (Klassifizierungs-Label + Farbe)
- **Memory**:
  - [[feedback-cumulative-single-branch-pattern]] — Branch-Strategie (selbe Branch wie SLC-148/149)
  - [[feedback-design-premium-look-pflicht]] — Premium-Look Pflicht
  - [[feedback-slice-phase-a-b-split-for-large-slices]] — Phase-A/B-Split bei grossen Slices
  - [[feedback-pure-helper-extraction-for-jsdom-free-tests]] — Pure-Logic-Pattern jsdom-frei
- **Quelle (Dev-System, Founder-freigegeben 2026-05-28)**:
  - `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` (Layout-Master, 17 Seiten A4, 1403 Zeilen)
