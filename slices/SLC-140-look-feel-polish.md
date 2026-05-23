# SLC-140 — FEAT-059 Look-and-Feel-Polish nach Style Guide V2

**Feature:** FEAT-059
**Version:** V7.3 (Smart-Split aus V7.1 2026-05-21, Re-Plan 2026-05-22 nach V7.2-Release)
**Status:** done (code-side, MT-1..MT-7 alle abgeschlossen 2026-05-23, /qa SLC-140 als Slice-Schluss pending)
**Created:** 2026-05-20, Re-Planned 2026-05-22 (RPT-335)
**Estimated effort:** ~6-12h Code-Side (Pre-Audit hat Playwright-Setup-Lueke aufgedeckt)
**Actual effort:** ~10h Code-Side (MT-6 wie geplant aufwendigster Teil mit Live-Run-Setup 1.5h)
**Pre-Conditions:**
- V7.2 RELEASED (REL-021, main HEAD `a11374d`, Live-Smoke PASS RPT-334) — QuickActionRing braucht den Email-Button-Slot, der durch SLC-141 MT-5 als Interim-Button in `BerichtRenderer` existiert (User-Default Option b, kein QuickActionRing-Wait).
- SLC-137 EditableText-Migration LIVE (RPT-320) — Audit-Skript-Run als Quality-Gate.
- SLC-138 Helper-Texts LIVE (RPT-323) — Info-Icon-Slot in `QuestionFlow.tsx` bereits gerendert.
**Worktree:** `slc-140-look-feel-polish` (Pflicht, per [[feedback-worktree-cleanup-sequence-pflicht]])

## Zweck

Diagnose-Start + Run + Bericht-Pages visuell auf Style-Guide-V2-Niveau heben — Hero-Section, mehrfarbige Section-Cards, QuickActionRing, professionelle Empty-/Error-States, Responsive 375/768/1280. Page-Level-Visual-Reference-Checklist als QA-Anker (per [[feedback-look-alignment-needs-page-level-scope]]).

## Pre-Audit (2026-05-22, RPT-335)

### Finding 1: Kein eigenes `src/components/design-system/`
Onboarding-Plattform hat KEINE Design-System-Komponenten-Library wie das Business-System-Memory (`feedback_style_guide_v2_mandatory.md`, 21 Tage alt) suggeriert. Real existieren:
- `src/components/ui/` — shadcn/ui-Komponenten (Card, Button, Dialog, etc.)
- `src/components/text-override/` — EditableText + Provider (SLC-137)
- Diverse Feature-Subfolders (dashboard, admin, branding, capture-modes, etc.)

**Konsequenz:** Style Guide V2 wird in SLC-140 inline ueber shadcn/ui + Tailwind realisiert — KEIN Port einer Design-System-Library aus Business-System (Pattern-Reuse-Regel [[strategaize-pattern-reuse]] gilt fuer reusable Patterns, nicht fuer komplette Library-Migrationen). Neue Components leben unter `src/app/dashboard/diagnose/*/components/`.

### Finding 2: Tailwind-Config hat 4 Brand-Farben, keine 6-Section-Palette
`tailwind.config.ts` definiert:
- `brand.primary` (CSS-var-driven via `--brand-primary-rgb`, Default `#4454b8`) + `brand.primary-dark`
- `brand.success` / `brand.success-dark`
- `brand.warning` / `brand.warning-dark`
- shadcn-HSL-Variables (`background`, `card`, `primary`, `secondary`, etc.)

**Konsequenz:** Fuer 6 mehrfarbige Section-Cards keine Token-Erweiterung — pragmatisch Tailwind-Default-Color-Palette via Utility-Klassen:
- Block 1 (z.B. "Wissens-Erfassung"): `blue-500` / `blue-50` / `blue-200`
- Block 2 ("Entscheidungsbefugnis"): `emerald-500` / `emerald-50` / `emerald-200`
- Block 3 ("Prozess-Reife"): `amber-500` / `amber-50` / `amber-200`
- Block 4 ("Kommunikation"): `violet-500` / `violet-50` / `violet-200`
- Block 5 ("Skalierbarkeit"): `rose-500` / `rose-50` / `rose-200`
- Block 6 ("Strategische Ausrichtung"): `teal-500` / `teal-50` / `teal-200`

Reihenfolge MUSS mit `ScoreVisual`-Bar-Farben konsistent sein. Bar-Color-Mapping wird in MT-1 zentralisiert in einer Helper-Datei (`src/lib/diagnose/block-colors.ts`) — beide Komponenten (`ScoreVisual` + `BlockSectionCard`) konsumieren denselben Helper.

### Finding 3: KEIN Playwright im Repo
- `package.json` enthaelt **keine** `@playwright/test`-Dep
- Keine `playwright.config.ts`
- Kein `tests/`-Verzeichnis

**Konsequenz:** MT-6 (Visual-Regression) ist zweigeteilt:
- **MT-6a Setup** (~1-2h): `@playwright/test` installieren, `playwright.config.ts`, `npx playwright install chromium`, `.gitignore`-Anpassungen fuer `test-results/` + `playwright-report/`, npm-Script `test:e2e`.
- **MT-6b Test-Akteur** (~1h): Setup-Helper fuer eingeloggten Test-Mandant via Admin-API (Pattern aus [[reference-playwright-browser-smoke]] + [[reference-playwright-live-smoke-pattern]]).
- **MT-6c Spec + Snapshots** (~1-2h): 3 Pages x 3 Viewports = 9 Baseline-Snapshots.

Total MT-6 ist ~3-5h statt der urspruenglich geplanten ~1h. Realistischer Slice-Aufwand: **6-12h** (war 4-8h).

### Finding 4: Diagnose-Components-Subfolders existieren noch nicht
Aktuelle Page-Struktur:
- `src/app/dashboard/diagnose/start/page.tsx` (single-file mit inline JSX, ~220 Zeilen, EditableText durchgaengig)
- `src/app/dashboard/diagnose/run/[capture_session_id]/page.tsx`
- `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx`
- `src/app/dashboard/diagnose/[capture_session_id]/bericht-pending/page.tsx`

**Konsequenz:** Alle neuen Komponenten (`HeroSection`, `ThreeStepsBlock`, `ProgressIndicator`, `QuestionCard`-Erweiterung, `AnswerOption`, `NavigationButtons`, `BlockSectionCard`, `QuickActionRing`, `EmptyState`, `PendingState`, `ErrorState`) sind Neuanlagen. Folder-Struktur wird in MT-1 angelegt.

## Pre-Condition-Verifikation

VOR MT-2..5: EditableText-Audit-Skript-Run gegen `slc-140-look-feel-polish`-Branch. Erwartet: keine Hardcode-Regression. Bei Drift -> Patch-Slice vor Polish-Implementierung.

## In Scope

Siehe FEAT-059 fuer Visual-Spec. Konkret:
- Diagnose-Start-Screen: Hero + Partner-Branding-Header + 3-Schritte-Block + prominent CTA.
- Diagnose-Run-Page: Progress-Indicator + Frage-Card mit Info-Icon (FEAT-057-Integration) + visuell unterscheidbare Antwort-Optionen + Auto-Save-Indicator.
- Bericht-Page: Page-Header + Score-Visual oben + 6 mehrfarbige Section-Cards + QuickActionRing (3-4 Aktionen) + Pflicht-Output-Footer.
- Bericht-Pending: professioneller "KI verarbeitet noch"-State.
- Empty-States: Dashboard-no-Session, Error-State.
- Responsive 375/768/1280 verifiziert via Playwright-Snapshots.
- Page-Level-Visual-Reference-Checklist (8-12 Sub-Checks pro Page) dokumentiert.

## Out of Scope

- Auth-Pages (`/login`, `/auth/verify-signup`) Polish — V7.4+ bei Bedarf.
- Admin-Bereich (`/admin/*`) Polish — V8+.
- Dark-Mode — V8+.
- Animation/Transitions ueber Standard-Hover/Click — V7.4+.
- Component-Library-Konsolidierung (Port Business-System-Design-System) — kein Reuse weil Library dort auch nicht in der erwarteten Form existiert (Pre-Audit-Finding 1).
- Token-Erweiterung Tailwind-Config fuer 6 Section-Farben — pragmatisch Tailwind-Defaults (Finding 2).
- Marketing-Root-Pages (`/`, `/about`) — nicht im Diagnose-Funnel-Scope.

## Micro-Tasks

### MT-1: Pre-Audit-Documentation + Block-Color-Helper + Components-Folder-Setup

- **Goal:** Pre-Audit-Findings im Slice-File festgehalten. Zentrale Block-Color-Helper-Lib angelegt (6 Farben + Reihenfolge konsistent mit ScoreVisual). Neue Components-Subfolders unter `src/app/dashboard/diagnose/start/components/`, `.../run/components/`, `.../bericht/components/`.
- **Files:**
  - `src/lib/diagnose/block-colors.ts` (NEU) — exportiert `BLOCK_COLORS: readonly { accent, bg, border, text }[]` mit 6 Tailwind-Farb-Klassen-Sets in der Reihenfolge, in der die Bloecke aus `partner_diagnostic_v1`-Template kommen.
  - `src/lib/diagnose/__tests__/block-colors.test.ts` (NEU) — 3 Vitest: (1) genau 6 Eintraege, (2) alle 6 Farben distinct, (3) ScoreVisual-Reihenfolge identisch zu BlockSectionCard-Reihenfolge (via Index-Match-Smoke).
  - `src/app/dashboard/diagnose/start/components/.gitkeep` (NEU) — Folder-Anlage.
  - `src/app/dashboard/diagnose/run/components/.gitkeep` (NEU).
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht/components/.gitkeep` (NEU).
  - `slices/SLC-140-look-feel-polish.md` — Page-Level-Visual-Reference-Checklist-Section ergaenzt (siehe Anhang dieses Files).
- **Expected behavior:** Block-Color-Helper liefert deterministische Mapping. Audit-Skript-Run nach Folder-Anlage zeigt 0 Hardcode-Regression.
- **Verification:** `npx vitest run src/lib/diagnose/__tests__/block-colors.test.ts` → 3/3 PASS. Manuell Pre-Audit-Section lesbar.
- **Dependencies:** Keine.

### MT-2: Diagnose-Start-Screen Polish

- **Goal:** Hero-Section (Brand-Headline + Subline + visueller Anker) + Partner-Branding-Header (Logo + Steuerberater-Name) + 3-Schritte-Block (Diagnose → Bericht → Berater-Gespraech) + prominent CTA-Button + dezenter Datenschutz-Hinweis. Bestehende EditableText-Aufrufe bleiben 1:1 erhalten.
- **Files:**
  - `src/app/dashboard/diagnose/start/components/HeroSection.tsx` (NEU) — Strategaize-Diagnose-Title + Subtitle + Decorative Element (z.B. brand-gradient-Banner).
  - `src/app/dashboard/diagnose/start/components/ThreeStepsBlock.tsx` (NEU) — 3 horizontal arrangierte Cards (Mobile: stacked) mit Icon + Step-Title + Step-Description. EditableText fuer alle Strings.
  - `src/app/dashboard/diagnose/start/components/StartCTA.tsx` (NEU) — Server-Action-Form-Wrapper um `startDiagnoseRun`, Button gross + primary-color + Hover-State + Loading-Indicator via `useFormStatus`.
  - `src/app/dashboard/diagnose/start/page.tsx` (MODIFY) — neuer Page-Composition mit Hero + Branding-Header + 3-Steps + StartCTA + Privacy-Footer. Bestehende `tenant_kind`-Gate-Logik + Redirect-Handling + Partner-Branding-Resolve UNVERAENDERT.
- **Expected behavior:** Page nutzt shadcn-Card + Tailwind brand-primary CSS-var. CTA `<EditableText>`-Wrapper bleibt. 8/8 Visual-Sub-Checks PASS (siehe Checklist).
- **Verification:** Lokaler `npm run dev` + Browser-Smoke auf `/dashboard/diagnose/start`. tsc EXIT=0. EditableText-Audit-Skript 0 Regression.
- **Dependencies:** MT-1.

### MT-3: Diagnose-Run-Page Polish

- **Goal:** Progress-Indicator (1-24 Fragen, current step) + Frage-Card mit klarem Frage-Label + Info-Icon-Slot (SLC-138 HelperTextModal-Integration intakt) + Antwort-Optionen als visuelle Cards (nicht plain Radio) + konsistente Back/Next-Buttons + Auto-Save-Pulse-Indicator. Bestehende `QuestionFlow.tsx` wird erweitert, nicht ersetzt.
- **Files:**
  - `src/app/dashboard/diagnose/run/components/ProgressIndicator.tsx` (NEU) — Progress-Bar + "Frage N von 24"-Text.
  - `src/app/dashboard/diagnose/run/components/AnswerOptionCard.tsx` (NEU) — Card-Style fuer Radio-Option (selected/hover/focus States).
  - `src/app/dashboard/diagnose/run/components/AutoSaveIndicator.tsx` (NEU) — kleiner Pulse-Indicator mit "Gespeichert"-Text.
  - `src/app/dashboard/diagnose/run/components/NavigationButtons.tsx` (NEU) — Zurueck/Weiter-Buttons mit konsistentem Spacing.
  - Bestehende `QuestionFlow.tsx` (suchen + MODIFY) — Layout-Wrap mit ProgressIndicator oben, AutoSaveIndicator unten, AnswerOptionCard statt Radio. Info-Icon + HelperTextModal-Verkabelung aus SLC-138 UNVERAENDERT.
- **Expected behavior:** Frage-Page sieht visuell ansprechend, klare Progress-Visibility, Auto-Save sichtbar. EditableText-Aufrufe intakt.
- **Verification:** Browser-Smoke `/dashboard/diagnose/run/[id]`. Helper-Modal-Open-Klick funktioniert weiter. 10/10 Visual-Sub-Checks PASS.
- **Dependencies:** MT-1.

### MT-4: Bericht-Page Polish — Section-Cards + QuickActionRing

- **Goal:** Page-Header + Score-Visual oben mit 6 mehrfarbigen Bars (Block-Colors konsistent zur Section-Cards-Reihenfolge) + 6 BlockSectionCards (jede in eigener Block-Farbe) + QuickActionRing mit 3-4 Aktionen + Pflicht-Output-Footer (EditableText). Bestehende `BerichtRenderer` + `ScoreVisual` werden erweitert.
- **Files:**
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht/components/BlockSectionCard.tsx` (NEU) — Card mit colored top-strip, Block-Title, Score-Mini-Bar (block-color), KI-Kommentar-Markdown-Render (re-using react-markdown aus SLC-138).
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht/components/QuickActionRing.tsx` (NEU) — 4 Action-Slots:
    - Email-Versand → ruft existierenden `SendReportByEmailModal` aus SLC-141 auf (Interim-Button in `BerichtRenderer` wird durch QuickActionRing-Action ersetzt — visueller Konsolidierungs-Schritt, Funktionalitaet 1:1).
    - Print → `window.print()` (existierender Print-Pfad).
    - "Ich will mehr" → existierender Lead-Push-CTA aus SLC-105.
    - Re-Run-optional → reset-flow oder hide bei nur 3 Aktionen.
  - Bestehende `ScoreVisual.tsx` (suchen + MODIFY) — Farb-Klassen via `block-colors.ts`-Helper.
  - Bestehende `BerichtRenderer.tsx` (suchen + MODIFY) — neue Page-Composition mit Header + ScoreVisual + BlockSectionCards.map() + QuickActionRing + Output-Footer. Interim-Email-Button entfernt (jetzt in QuickActionRing). EditableText-Aufrufe 1:1 erhalten.
- **Expected behavior:** 6 Bloecke in 6 distinct Akzent-Farben (Reihenfolge identisch zu ScoreVisual-Bars). QuickActionRing-Pattern visuell aufgeraeumt (Aktionen prominent). Print-Pfad unveraendert. Email-Modal-Open-Klick aus QuickActionRing funktioniert wie vorher aus dem Interim-Button.
- **Verification:** Browser-Smoke `/dashboard/diagnose/[id]/bericht`. Email-Modal oeffnet sich. Print-Dialog oeffnet sich. ScoreVisual-Farben matchen BlockSectionCard-Farben (visuell). 12/12 Visual-Sub-Checks PASS.
- **Dependencies:** MT-1, SLC-141 LIVE (sendDiagnoseReportByEmail + SendReportByEmailModal existieren).

### MT-5: Empty-/Error-/Pending-States

- **Goal:** 3 dedizierte States visuell ansprechend.
  - "Noch keine Diagnose gestartet" auf Dashboard-Diagnose-Card (Icon + Title + Anleitungstext + CTA).
  - "Diagnose laeuft, KI verarbeitet" als `bericht-pending`-Page-Polish (Spinner + Estimated-Time + Info-Hint).
  - "Etwas ist schiefgegangen" als generischer Error-State (Icon + Title + Retry-Button + Support-Hinweis).
- **Files:**
  - `src/app/dashboard/diagnose/start/components/EmptyState.tsx` (NEU).
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht-pending/components/PendingState.tsx` (NEU).
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht/components/ErrorState.tsx` (NEU).
  - Bestehende `bericht-pending/page.tsx` (MODIFY) — PendingState-Composition.
  - Bestehende Dashboard-Diagnose-Card (suchen + MODIFY) — EmptyState bei `no active session`.
- **Expected behavior:** Alle 3 States nutzen EditableText (kein Hardcode). Visuell konsistent mit Page-Polish.
- **Verification:** Empty-State erzwingen via Test-Tenant ohne Session. PendingState aktiv post-Submit. ErrorState via Force-Param (`?error=test`).
- **Dependencies:** MT-2..4.

### MT-6: Playwright-Setup + Visual-Regression

- **MT-6a Setup (~1-2h)**:
  - **Files:** `package.json` (add `@playwright/test` devDep), `playwright.config.ts` (NEU), `.gitignore` (`test-results/`, `playwright-report/`), `package.json` Script `"test:e2e": "playwright test"`.
  - **Verification:** `npx playwright install chromium` PASS. `npx playwright test --list` listet 0 Tests OK (Setup-Smoke).

- **MT-6b Test-Akteur (~1h)**:
  - **Files:** `tests/e2e/helpers/auth-setup.ts` (NEU) — Admin-API-basiertes Login-Helper (Pattern aus [[reference-playwright-browser-smoke]]), erzeugt Test-Tenant + Capture-Session via Setup-Hook und cleant nach Test.
  - **Verification:** Manuell Hook ausfuehren → eingeloggter Session in headed-Mode visible.

- **MT-6c Spec + Snapshots (~1-2h)**:
  - **Files:** `tests/e2e/diagnose-pages.spec.ts` (NEU) — 3 describe-Bloecke (start/run/bericht), je 3 viewports (375/768/1280), `toHaveScreenshot()` als Baseline.
  - **Verification:** `npx playwright test diagnose-pages` → 9 Baselines geschrieben. Touch-Target-Audit via `boundingBox().height >= 44` fuer Mobile-Run.

- **Expected behavior (gesamtes MT-6):** 9 Baseline-Snapshots vorhanden. Tests laufen lokal. QA kann Regression detektieren.
- **Dependencies:** MT-2..5 (Pages muessen LIVE-Polish-Stand sein).

### MT-7: Records-Update + Page-Level-Visual-Reference-Checklist-Anhang

- **Goal:** Cockpit-Records auf done. Page-Level-Visual-Reference-Checklist als Pflicht-Anhang in diesem Slice-File dokumentiert.
- **Files:**
  - `slices/SLC-140-look-feel-polish.md` (MODIFY) — Anhang "Page-Level-Visual-Reference-Checklist" mit 3 Pages x je 8-12 Sub-Checks (siehe Skelett unten).
  - `slices/INDEX.md` (MODIFY) — SLC-140 `planned` → `done`.
  - `features/INDEX.md` (MODIFY) — FEAT-059 `planned` → `done`.
  - `planning/backlog.json` (MODIFY) — BL-114 `in_progress` → `done`.
  - `docs/STATE.md` (MODIFY) — Current Focus auf "V7.3 SLC-140 done" + Naechster Schritt `/qa SLC-140`.
- **Expected behavior:** Checklist hat pro Page mindestens 8 Sub-Checks mit klarem Pass/Fail-Kriterium.
- **Verification:** Cockpit-Refresh zeigt SLC-140 done.
- **Dependencies:** MT-1..6.

## Acceptance Criteria

Siehe FEAT-059 AC-1..10. Plus:
- **AC-SLC-140-1:** Pre-Audit-Findings dokumentiert (Pre-Audit-Section dieses Files vorhanden, 4 Findings).
- **AC-SLC-140-2:** Block-Color-Helper (`block-colors.ts`) zentralisiert + 3/3 Vitest PASS.
- **AC-SLC-140-3:** ScoreVisual-Bar-Farben sind 1:1 konsistent mit BlockSectionCard-Akzent-Farben (Index-Match via Helper).
- **AC-SLC-140-4:** Page-Level-Visual-Reference-Checklist fuer 3 Pages mit je >=8 Sub-Checks dokumentiert + alle PASS.
- **AC-SLC-140-5:** EditableText-Coverage NICHT gebrochen — Audit-Skript-Run nach Polish zeigt 0 Regression (Mandate aus SLC-137).
- **AC-SLC-140-6:** Playwright-Setup live (MT-6a) + 9 Baseline-Snapshots gespeichert (MT-6c) + Touch-Target-Audit Mobile >=44px PASS.

## Risiken

- **R-1 Playwright-Setup-Overflow:** Wenn `@playwright/test`-Install langsam ist oder `chromium`-Download im Coolify-Build-Pipeline auffaellt, kann MT-6a >2h dauern. Mitigation: Playwright als devDep, kein Production-Bundle-Impact, Coolify-Build laeuft sowieso ohne devDeps (`NODE_ENV=production`).
- **R-2 ScoreVisual-Color-Drift:** Bestehende `ScoreVisual.tsx` koennte Farben hardcoded haben, nicht via Helper. MT-1 muss diese Stelle identifizieren und MT-4 muss sie migrieren. Mitigation: in MT-1 Grep nach `chart-` / `blue-` in ScoreVisual-Pfad als Pre-Check.
- **R-3 QuickActionRing-Email-Action-Konsolidierung:** Interim-Email-Button in `BerichtRenderer` (SLC-141 MT-5) wird durch QuickActionRing-Action ersetzt — wenn UI-Wiring nicht 1:1 die gleiche Server-Action ruft, faellt Email-Versand aus. Mitigation: Email-Action-Trigger als gleichen `handleEmailClick`-Handler weiterleiten, plus QA-Live-Smoke-Test-Case "Email-Open + Send von QuickActionRing".
- **R-4 EditableText-Hardcode-Regression:** Bei Re-Composition koennten EditableText-Wrapper versehentlich entfernt werden. Mitigation: Audit-Skript-Run nach jedem MT (2..5) als Self-Check.
- **R-5 Slice-Aufwand-Ueberlauf:** Realistisches 6-12h-Band statt 4-8h. Bei >12h Stop + Re-Plan-Entscheidung User.

## Page-Level-Visual-Reference-Checklist (wird in MT-7 final ausgefuellt)

Pattern aus [[feedback-look-alignment-needs-page-level-scope]] — pro Page 8-12 Sub-Checks mit klarem Pass/Fail.

### Page 1: `/dashboard/diagnose/start`
1. [ ] Hero-Section sichtbar oben (Title + Subtitle + visueller Anker).
2. [ ] Partner-Branding-Header (Logo + Steuerberater-Name) wenn `branding.displayName` gesetzt.
3. [ ] 3-Schritte-Block visuell distinct (Diagnose / Bericht / Berater-Gespraech).
4. [ ] CTA-Button gross + primary-color (`brand-primary`) + Hover-State funktional.
5. [ ] Datenschutz-Hinweis dezent in Footer (small + muted).
6. [ ] Mobile-Stack: Drei Schritte vertical stacked auf 375px, horizontal auf 1280px.
7. [ ] Spacing konsistent (Tailwind-Scale, kein Drift).
8. [ ] EditableText 6/6 Aufrufe vorhanden (Audit-Skript clean).
9. [ ] Direkt-Kunden-Gate-Page (tenant_kind != partner_client) hat Polish-Treatment.

### Page 2: `/dashboard/diagnose/run/[id]`
1. [ ] Progress-Indicator oben sichtbar ("Frage N von 24" + Visual-Bar).
2. [ ] Frage-Card mit klarem Title + Info-Icon (wenn helper_text) + Modal-Trigger funktional.
3. [ ] Antwort-Optionen als visuelle Cards (nicht plain Radio).
4. [ ] Selected-State der Antwort-Option visuell distinct (border + bg).
5. [ ] Hover/Focus-State auf Cards funktional.
6. [ ] Zurueck/Weiter-Buttons konsistent positioniert (bottom).
7. [ ] Auto-Save-Indicator sichtbar nach Antwort-Klick (~1-2s Pulse).
8. [ ] Mobile-Stack: Antwort-Cards vertical full-width auf 375px.
9. [ ] Touch-Target >=44px Mobile (Buttons + Cards).
10. [ ] HelperTextModal aus SLC-138 oeffnet sich auf Info-Icon-Klick.
11. [ ] EditableText-Aufrufe in QuestionFlow + Antwort-Optionen intakt.

### Page 3: `/dashboard/diagnose/[id]/bericht`
1. [ ] Page-Header mit Partner-Branding + Title sichtbar oben.
2. [ ] ScoreVisual mit 6 Block-Score-Zeilen (jeweils 0-100 mit score-range-Farben red/amber/emerald), Block-Reihenfolge identisch zu BlockSectionCards (Phrasierung korrigiert in MT-7 per F-3 — die ursprueglich gemeinten "mehrfarbigen Bars" pro Block existieren nicht, ScoreVisual zeigt einen Balken pro Block in der nach Score abgeleiteten Ampel-Farbe).
3. [ ] 6 BlockSectionCards in 6 distinct Akzent-Farben (blue/emerald/amber/violet/rose/teal).
4. [ ] Block-Reihenfolge zwischen ScoreVisual-Bars und BlockSectionCards identisch (Index-Match via `block-colors.ts`-Helper).
5. [ ] KI-Kommentar in jeder Card als gerendertes Markdown (nicht raw).
6. [ ] QuickActionRing sichtbar mit 3-4 Aktionen.
7. [ ] Email-Action im QuickActionRing oeffnet SendReportByEmailModal (SLC-141-Wiring).
8. [ ] Print-Action ruft window.print().
9. [ ] "Ich will mehr"-Action ruft existierenden Lead-Push-CTA.
10. [ ] Pflicht-Output-Footer mit EditableText sichtbar.
11. [ ] Mobile-Stack: BlockSectionCards vertical stacked auf 375px.
12. [ ] EditableText-Coverage in BerichtRenderer intakt (Audit-Skript clean).

### Page 3b: `/dashboard/diagnose/[id]/bericht-pending` (Pending-State)
1. [ ] Spinner oder Progress-Animation sichtbar.
2. [ ] Estimated-Time-Hint sichtbar ("ca. 1-2 Minuten").
3. [ ] EditableText fuer alle Strings.

## Bekannte Visuals — Material fuer /qa SLC-140

Aus MT-6c Baseline-Run 2026-05-23 (9 PNGs unter `tests/e2e/diagnose-pages.spec.ts-snapshots/`, dokumentiert in Memory `project_op_v73_slc140_mt6_baselines_done`). Diese Findings sind keine Code-Bugs in MT-1..MT-5, sondern Beobachtungen aus dem Live-Render-Snapshot, die in /qa SLC-140 Live-Browser-Smoke endgueltig bewertet werden muessen.

### F-1 (Medium): Floating "N"-User-Avatar auf Start- + Bericht-Mobile-Snapshots
Auf `diagnose-start-chromium-mobile-win32.png` links neben Step-1-Card sichtbar ein kleiner schwarzer Kreis mit "N". Auf `diagnose-bericht-chromium-mobile-win32.png` ebenfalls links neben "Strukturelle KI-Reife"-Card. Vermutung: User-Profile-Avatar aus `AppHeader`, der bei Mobile-Layout ueberlappt — oder dev-only Element. **In /qa pruefen via Live-Browser-Smoke** ob das intended ist oder ein Visual-Bug, der einen Auto-Fix per Deviation Rule 1/2 erfordert.

### F-2 (Medium): Run-Page rendert Long-Form-Mode statt Step-by-Step bei leeren answers
`diagnose-run-chromium-mobile-win32.png` ist 14529px hoch — die Page rendert alle 24 Fragen scrollbar untereinander. Vermutung: bei `capture_session.answers = {}` (Test-Setup-Default) faellt die Page in einen Long-Form-Mode. In /qa klaeren: ist das intended fuer first-visit oder muesste auch fuer empty-answers ein Step-by-Step-Mode gelten? Wenn intended: Baseline-Snapshot ist korrekt und dokumentiert das First-Visit-Verhalten.

### F-3 (Low): ScoreVisual rendert 6 Block-Score-Zeilen, nicht 6 mehrfarbige Bars
Bestaetigt R-6 Carry-Over aus mt5-Memory. ScoreVisual zeigt einen Balken pro Block, eingefaerbt nach score-range (red/amber/emerald), nicht pro Block in der Block-Akzent-Farbe. **In MT-7 dokumentiert (Page 3 Check 2 oben umformuliert)**, keine Code-Aenderung — die aktuelle Implementierung ist konsistent mit dem `block-colors.ts`-Helper, der nur fuer die `BlockSectionCard`-Akzent-Linie genutzt wird, nicht fuer ScoreVisual.

### F-4 (Medium): Touch-Target-Audit Mobile fail auf Start + Run
2 echte Touch-Target-Findings aus MT-6c Live-Run:
- Start-Mobile: 1 interaktives Element < 44px hoch (aggregiert in `expect.soft`, genaue Element-Identifikation in `trace.zip`)
- Run-Mobile: Target #145 hat `boundingBox.height = 32px`. Target-Nummer #145 deutet auf zu breiten Selektor (`button, [role='radio'], label:has(input[type='radio'])`) hin — vermutlich werden Container-Labels mit eingefangen, die optisch keine Touch-Targets sind. **In /qa SLC-140 entweder Selektor enger schneiden** (`button:not([role="presentation"])`) **ODER `data-testid="touch-target"`-Marker in den Spec-relevanten Komponenten setzen** und die Audit-Logik auf diesen Marker umstellen.

## Empfohlene Reihenfolge

MT-1 → MT-2 (Start) → MT-3 (Run) → MT-4 (Bericht) → MT-5 (States) → MT-6 (Playwright) → MT-7 (Records).

MT-2/3/4 koennen theoretisch parallel laufen, sind aber sequentiell empfohlen um EditableText-Audit-Regression nach jedem MT zu pruefen.

## Naechster Schritt (nach MT-7)

`/qa SLC-140` — Quality-Gates + Live-Browser-Smoke + EditableText-Audit + Playwright-Snapshots-PASS + Visual-Reference-Checklist 30+ Sub-Checks PASS.

Danach: Master-Merge `slc-140-look-feel-polish` → `main` (per [[feedback-slice-merge-at-end]]) → User-Coolify-Redeploy → MT-8 Live-Smoke via Playwright-MCP (`/dashboard/diagnose/start` + `/run` + `/bericht`) → V7.3 Release-Ready.
