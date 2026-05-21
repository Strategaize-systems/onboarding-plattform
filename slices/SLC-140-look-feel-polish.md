# SLC-140 — FEAT-059 Look-and-Feel-Polish nach Style Guide V2

**Feature:** FEAT-059
**Version:** V7.3 (Smart-Split aus V7.1 2026-05-21)
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~4-8h Code-Side
**Pre-Conditions:** SLC-137 done (EditableText-Migration intakt, sonst Doppelarbeit beim Re-Styling)
**Worktree:** `slc-140-look-feel-polish` (Pflicht)

## Zweck

Diagnose-Start + Run + Bericht-Pages auf Style Guide V2-Konformitaet bringen. Mehrfarbige Section-Cards (IS-SLC-115-Pattern), QuickActionRing fuer Bericht-Aktionen, Empty-/Error-States, Responsive 375/768/1280, Page-Level-Visual-Reference-Checklist als QA-Anker.

## Pre-Condition-Verifikation

VOR MT-1: EditableText-Coverage aus SLC-137 vollstaendig + Audit-Skript meldet 0 Hardcodes im Diagnose-Pfad. Falls Drift: SLC-137-Patch-Slice VOR SLC-140-Start.

## In Scope

Siehe FEAT-059. Konkret:
- Diagnose-Start-Screen Hero + Partner-Branding + 3-Schritte-Block + CTA-Button.
- Diagnose-Run-Page Progress-Indicator + Frage-Card mit unterscheidbaren Antwort-Optionen.
- Bericht-Page mehrfarbige Section-Cards (6 Bloecke = 6 Farben) + QuickActionRing (3-4 Aktionen).
- Empty-States 3 Faelle, Error-States.
- Responsive 375/768/1280 verifiziert.
- Page-Level-Visual-Reference-Checklist pro Page dokumentiert.

## Out of Scope

- Auth-Pages Polish (V7.2+).
- Admin-Bereich Polish.
- Dark-Mode (V8+).
- Animation ueber Standard-Hover/Click.
- Component-Library-Konsolidierung.

## Micro-Tasks

### MT-1: Style Guide V2 Token-Check + Pre-Audit
- Goal: Vor Polish-Implementierung Style Guide V2-Tokens in `tailwind.config.ts` vollstaendig (primary/secondary/accent-color, spacing, font-scale). Page-Level-Visual-Reference-Checklist pro Page mit je 8-12 Sub-Checks aufschreiben.
- Files: `tailwind.config.ts` (Pruefung + falls Drift, Token-Nachpflegung), `slices/SLC-140-look-feel-polish.md` Section "Page-Level-Visual-Reference-Checklist" (Erweiterung mit Sub-Checks).
- Expected behavior: Token-Bestand dokumentiert. Sub-Checks pro 3 Pages konkret formuliert (Header / Hero / Sections / Cards / Buttons / Spacing / Typography / Empty/Error / Responsive / Branding-Consistency).
- Verification: Manueller Cross-Check Style Guide V2 vs. tailwind.config.
- Dependencies: Keine.

### MT-2: Diagnose-Start-Screen Polish
- Goal: Hero-Section + Partner-Logo (falls Partner-Branding aktiv) + 3-Schritte-Block (Diagnose -> Bericht -> Berater-Gespraech) + prominent CTA-Button.
- Files: `src/app/dashboard/diagnose/start/page.tsx`, `src/app/dashboard/diagnose/start/components/HeroSection.tsx`, `.../ThreeStepsBlock.tsx`.
- Expected behavior: Page nutzt Section-Cards-Pattern aus IS-SLC-115. CTA-Button primary-color, Hover-State. Datenschutz-Footer dezent.
- Verification: Browser-Smoke + Page-Level-Visual-Reference-Checklist 8/8 PASS.
- Dependencies: MT-1.

### MT-3: Diagnose-Run-Page Polish
- Goal: Progress-Indicator (24 Fragen), Frage-Card mit Info-Icon-Slot (FEAT-057-Integration), visuell unterscheidbare Antwort-Optionen, Zurueck+Weiter konsistent, Auto-Save-Indicator.
- Files: `src/app/dashboard/diagnose/run/page.tsx`, `src/app/dashboard/diagnose/run/components/ProgressIndicator.tsx`, `.../QuestionCard.tsx` (Erweiterung), `.../AnswerOption.tsx`, `.../NavigationButtons.tsx`.
- Expected behavior: Progress sichtbar oben. Frage-Card mit klarem Label + Info-Icon (wenn helper_text gesetzt). Antwort-Buttons als Cards. Auto-Save-Pulse-Indicator unten.
- Verification: Browser-Smoke + Page-Level-Visual-Reference-Checklist 10/10 PASS.
- Dependencies: MT-1, SLC-138 MT-5 (Info-Icon-Integration in QuestionCard).

### MT-4: Bericht-Page Polish mit Section-Cards + QuickActionRing
- Goal: Page-Header + Score-Visual oben + 6 mehrfarbige Section-Cards (Block-Akzent-Farben pro Block, gleiche Farbe-Reihenfolge wie ScoreVisual) + QuickActionRing mit 3-4 Aktionen (Email-Versand FEAT-060, Print, "Ich will mehr"-CTA, optional Re-Run).
- Files: `src/app/dashboard/diagnose/bericht/page.tsx`, `src/app/dashboard/diagnose/bericht/components/BlockSectionCard.tsx`, `.../QuickActionRing.tsx`.
- Expected behavior: 6 Bloecke in 6 unterschiedlichen Akzent-Farben (z.B. blue, green, amber, purple, rose, teal). QuickActionRing-Pattern aus IS-SLC-115. Bericht-Footer mit EditableText fuer Pflicht-Output-Aussage.
- Verification: Browser-Smoke + Page-Level-Visual-Reference-Checklist 12/12 PASS. Visual-Diff zu Pre-Polish positiv beurteilbar.
- Dependencies: MT-1, SLC-141 MT-3 (Email-Versand-Action Stub-Wiring, voll-funktional in SLC-141).

### MT-5: Empty-/Error-States 3 Pages
- Goal: "Noch keine Diagnose gestartet" auf Dashboard-Diagnose-Card. "Diagnose laeuft, KI verarbeitet" auf Bericht-Pending. "Etwas ist schiefgegangen" Error-State mit Retry + Support-Kontakt.
- Files: `src/app/dashboard/diagnose/start/components/EmptyState.tsx`, `src/app/dashboard/diagnose/bericht/components/PendingState.tsx`, `src/app/dashboard/diagnose/bericht/components/ErrorState.tsx`.
- Expected behavior: Alle Empty-/Error-States nutzen EditableText (Migration aus SLC-137). Visuell ansprechend (Icon + Title + Sub-Text + Action).
- Verification: Manuell jeweils Empty-State erzwingen (z.B. neuer Mandant ohne Session, Bericht-Page direkt nach Submit, Force-Error via Test-Param).
- Dependencies: MT-2..4.

### MT-6: Responsive 375/768/1280 + Playwright-Visual-Regression
- Goal: 3 Viewport-Sizes verifiziert. Touch-Targets >= 44px Mobile. Section-Cards stacken vertikal auf Mobile. Playwright-Visual-Snapshots fuer 3 Pages als Baseline.
- Files: `tests/playwright/diagnose-pages.spec.ts` (neu, falls Playwright nicht eingerichtet -> Setup als Sub-MT).
- Expected behavior: Snapshots fuer 3 Pages mal 3 Viewports = 9 Baselines. Bei Regression in QA -> Playwright meldet Diff.
- Verification: Snapshots gespeichert. Touch-Target-Audit via Playwright `boundingBox` >= 44.
- Dependencies: MT-2..5.

### MT-7: Records-Update + Page-Level-Visual-Reference-Checklist Doku
- Goal: Records auf done. Page-Level-Visual-Reference-Checklist als Pflicht-Sub-Section in diesem Slice-File dokumentiert (V7.1-Lehre aus IS-SLC-115).
- Files: `slices/SLC-140-look-feel-polish.md` (Erweiterung am Ende), `slices/INDEX.md`, `planning/backlog.json` (BL-114 -> done), `features/INDEX.md` (FEAT-059 -> done), `docs/STATE.md`.
- Expected behavior: Checklist hat fuer jede der 3 Pages 8-12 Sub-Checks mit klarem Pruef-Kriterium. Cockpit zeigt SLC-140 done.
- Verification: Cockpit-Refresh.
- Dependencies: MT-1..6.

## Acceptance Criteria

Siehe FEAT-059 AC-1..10. Plus:
- AC-SLC-140-1: Pre-Audit Style Guide V2-Token-Bestand verifiziert.
- AC-SLC-140-2: Page-Level-Visual-Reference-Checklist 3 Pages mal mindestens 8 Sub-Checks dokumentiert.
- AC-SLC-140-3: EditableText-Coverage NICHT gebrochen (Audit-Skript-Run zeigt 0 Hardcode-Regressions).

## Risiken

- Re-Styling kann versehentlich EditableText-Aufrufe entfernen -> SLC-137 Audit-Skript-Re-Run als Quality-Gate in QA.
- Playwright-Setup falls noch nicht im Repo -> Setup-Aufwand als Sub-MT in MT-6.
- 6 Section-Card-Farben muessen mit ScoreVisual-Farben konsistent sein -> visuell aus IS-SLC-115 Reference-Repo entlehnen.
- QuickActionRing-Pattern unklar bei nur 3 vs 4 Aktionen -> Default 4 Aktionen, falls Email-Versand FEAT-060 verschoben wird auf V7.2 dann 3.
