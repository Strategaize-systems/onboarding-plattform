# SLC-143 — App-Shell Touch-Target + Auth-Pages-Polish

**Version:** V7.4
**Feature:** FEAT-062
**Status:** planned → in_progress (mit /backend-Start)
**Priority:** Medium
**Created:** 2026-05-23
**Worktree Branch:** `slc-143-app-shell-auth-pages-polish` (Pflicht per SaaS-Mode)

## Slice Overview

Reine Polish-Iteration mit klar abgegrenztem Scope. 1 globale Component-Aenderung (shadcn-Button-Default), 1 Component-Edit (Footer-Padding), 4 Auth-Pages nur visuell verifiziert (kein Code-Edit erwartet), 4 neue Playwright-Baselines, V7.3 9 Baselines re-run. **0 Migrations, 0 neue Backend-Pfade, 0 neue Production-Deps.**

## Pre-Conditions

- ✅ V7.3 RELEASED (REL-022, main `b88b20d`) — Diagnose-Funnel-Stand stabil als Regression-Vergleichs-Basis
- ✅ Playwright im Repo seit SLC-140 MT-6a (`@playwright/test` devDep + `playwright.config.ts` + `tests/e2e/`)
- ✅ Style-Guide-V2-konforme Auth-Pages-Layouts (Card + Branding-Gradient + Logo + Form — keine Layout-Schwaeche)
- ✅ 4 DECs DEC-151..154 entschieden (Q-V7.4-A..D Minimal-Scope-Pfad)
- ✅ Auth-Setup-Helper aus SLC-140 MT-6b vorhanden (`tests/e2e/helpers/auth-setup.ts`) — wiederverwendbar fuer Auth-Pages-Tests
- ✅ Coolify-Test-DB-Tunnel-Pattern dokumentiert (Memory `reference_coolify_test_setup`) fuer Playwright-Run mit DB-Zugriff

## Branch-Strategie

Worktree-Isolation Pflicht (SaaS-Mode):
- Worktree-Pfad: `c:\strategaize\strategaize-onboarding-plattform-slc143`
- Branch: `slc-143-app-shell-auth-pages-polish` von `main` HEAD `a5f5549`
- Erstellung: `git worktree add -b slc-143-app-shell-auth-pages-polish c:/strategaize/strategaize-onboarding-plattform-slc143 main`
- Node_modules-Setup: Junction `mklink /J node_modules ..\strategaize-onboarding-plattform\node_modules` (PowerShell, per Memory `reference_worktree_nodemodules_junction_windows`)
- Master-Merge nur nach Slice-/qa PASS (per `feedback_slice_merge_at_end`)
- Cleanup-Sequenz beachten (per `feedback_worktree_cleanup_sequence_pflicht`) — Junction-Delete vor `git worktree remove`

## Acceptance Criteria

Aus [FEAT-062-Spec](../features/FEAT-062-app-shell-auth-pages-touch-target-polish.md):

- **AC-1** Diagnose-Funnel Regression-Schutz: Touch-Target-Audit Mobile 375px auf Dashboard + Start + Run + Bericht = 0 Violations <44px im Diagnose-Funnel-Scope (heute schon 0; Regression-Schutz nach Button-Default-Anhebung).
- **AC-2** Auth-Pages Touch-Target: Mobile 375px Audit auf /login + /auth/set-password + /accept-invitation/[token] + /auth/verify-signup = 0 Violations <44px in allen `<Button>`-Elementen.
- **AC-3** Footer App-Shell: Footer auf JEDER Page (Dashboard + Bericht + Login + Set-Password) liefert 3 Links mit Touch-Area ≥44px (element-h≥44 ODER clickable-padding-Area≥44).
- **AC-4** Visual-Layout-Konsistenz: V7.3 Diagnose-Funnel-Baselines (9 PNGs) entweder PASS unveraendert oder mit kontrolliert dokumentiertem Diff-Threshold-Update / Baseline-Re-Generation.
- **AC-5** Auth-Pages-Baselines: 4 neue Mobile-Baselines angelegt (Login + Set-Password + Accept-Invitation + Verify-Signup, alle 375×812).
- **AC-6** Funktionalitaet unveraendert: Login + Set-Password + Accept-Invitation + Verify-Signup-Flows funktionieren end-to-end. Live-Smoke via Playwright-MCP Pflicht.
- **AC-7** Surgical-Changes-Disziplin: Keine i18n-String-Aenderungen, kein Auth-Card-Re-Skin, kein nicht-Touch-Target-relevanter Refactor.
- **AC-8** Quality-Gates Clean: `npx tsc --noEmit` EXIT=0 und `npx eslint <changed-files>` EXIT=0.

## Wiring-Verification-Liste

Vor /qa-Schluss pruefen:
- [ ] `<Button>` ohne `size`-Prop in MT-1 Pre-Audit alle gelistet → in MT-5 Visual-Regression alle visuell abgedeckt
- [ ] Footer-Component-Source-of-Truth in MT-1 final identifiziert → in MT-3 dort geaendert
- [ ] 4 Auth-Pages-Forms funktional unveraendert (Submit-Button click → existing Server-Action call → unchanged Auth-Flow)
- [ ] IchWillMehrCard-Trigger funktional unveraendert (click → openModal)
- [ ] Diagnose-Funnel-Buttons (QuickActionRing 3 Buttons, AnswerOptionCard, StartCTA, NavigationButtons) funktional unveraendert — auch wenn Default-Anhebung sie touchet (nur Pixel-Height +4px, keine Logic)

## Micro-Tasks

### MT-1: Pre-Audit (Usage-Grep + Live-Mobile-Audit + Footer-Source)
- **Goal**: Vollstaendige Bestandsaufnahme aller von DEC-151 betroffenen `<Button>`-Aufrufe + heute-Werte aller Auth-Pages-Touch-Targets + Footer-Component-Source-of-Truth identifizieren.
- **Files** (read-only Audit):
  - `src/**/*.tsx` per Grep `<Button` ohne `size="..."`-Prop
  - 4 Auth-Pages per Playwright-MCP Mobile 375px Live-Audit auf Production `https://onboarding.strategaizetransition.com`
  - Footer-Source: Search `Datenschutz` + `Impressum` + `Aufgesetzt mit Strategaize` im Repo
- **Expected behavior**: Markdown-Tabelle in MT-1-Doku oder direkt Slice-Notes mit (a) allen `<Button>`-Usage-Sites + ihren heutigen visuellen Hoehen, (b) Auth-Pages-Touch-Target-Audit-Ergebnissen (Pre-Stand vor MT-2), (c) Footer-Component-Pfad final identifiziert (vermutet: `src/components/branding/StrategaizePoweredFooter.tsx`).
- **Verification**: Tabelle vollstaendig, mindestens 5 Usage-Sites + 4 Pages + 1 Footer-Pfad identifiziert.
- **Dependencies**: none.
- **Aufwand**: ~30min.

### MT-2: shadcn-Button-Default-Anhebung (h-10 → h-11)
- **Goal**: 1 cva-Edit am shadcn-Button-Component → globaler Default-Size 4px hoeher.
- **Files**:
  - `src/components/ui/button.tsx` (Edit cva-Block `size.default`)
- **Expected behavior**: `buttonVariants` cva `size: { default: "h-10 px-4 py-2", ... }` → `default: "h-11 px-4 py-2"`. Alle anderen Size-Varianten (`sm`, `lg`, `icon`) unveraendert.
- **Verification**: `npx tsc --noEmit` EXIT=0 + `npx eslint src/components/ui/button.tsx` EXIT=0. Visual-Smoke nach MT-3 (kombiniert).
- **Dependencies**: MT-1 (Usage-Audit muss VOR Edit dokumentiert sein).
- **Aufwand**: ~15min.

### MT-3: Footer-Component Touch-Target-Anhebung
- **Goal**: 3 Footer-Links auf Touch-Area ≥44px anheben ohne Footer-Layout-Bruch auf Desktop/Tablet.
- **Files**:
  - `src/components/branding/StrategaizePoweredFooter.tsx` (Pfad in MT-1 final verifiziert) ODER Layout-Footer-Inline falls Footer dort lebt
- **Expected behavior**: 3 `<a>`-Elemente (Datenschutz / Impressum / Aufgesetzt mit Strategaize) mit Padding-Anhebung (`py-3` o.ae.) ODER `min-h-[44px] inline-flex items-center px-3`-Pattern. Footer-Hoehe wird ~25px groesser. Layout auf 3 Viewports (Mobile 375 / Tablet 768 / Desktop 1280) visuell konsistent.
- **Verification**: Visual-Smoke per Playwright-MCP auf 3 Viewports nach Local-Build, Mobile-Touch-Audit ergibt 0 Violations fuer Footer-Links.
- **Dependencies**: MT-1 (Source-of-Truth-Identifikation).
- **Aufwand**: ~30min.

### MT-4: Auth-Pages Visual-Verify (4 Pages × 3 Viewports)
- **Goal**: 4 Auth-Pages auf 3 Viewports rendern + Layout-Bruch-Check nach Button-Default-Anhebung (MT-2) + Footer-Anhebung (MT-3).
- **Files**: keine Edits erwartet (Buttons uebernehmen Default-Anhebung automatisch via shadcn-Component-Reuse). Falls Layout-Bruch entdeckt: Card-Padding o.ae. nachjustieren — dann Files dokumentieren.
- **Expected behavior**: Login + Set-Password + Accept-Invitation (mit dummy-Token = ErrorPage-Visual) + Verify-Signup (mit dummy-Token) rendern auf 375/768/1280 ohne sichtbaren Layout-Bruch. Buttons sichtbar 44px hoch.
- **Verification**: Playwright-MCP-Snapshots auf 3 Viewports pro Page, visueller Audit + Mobile-Touch-Target-Audit auf jeder Page.
- **Dependencies**: MT-2 + MT-3.
- **Aufwand**: ~30min.

### MT-5: Playwright-Baselines (V7.3 Re-Run + 4 neue Auth-Mobile-Baselines)
- **Goal**: Visual-Regression-Schutz-Schicht aktualisieren. V7.3 9 Diagnose-Baselines re-run mit Diff-Review (erwartet ~1% Diff durch Button-Height-Anhebung), 4 neue Auth-Pages-Mobile-Baselines anlegen.
- **Files**:
  - `tests/e2e/diagnose-pages.spec.ts` (re-run, evtl. Threshold-Update oder Baseline-Re-Generation)
  - `tests/e2e/diagnose-pages.spec.ts-snapshots/*.png` (potentielles Re-Generate aller 9 PNGs)
  - `tests/e2e/auth-pages.spec.ts` (NEU — 4 Test-Cases je 1 Mobile-Snapshot)
  - `tests/e2e/auth-pages.spec.ts-snapshots/auth-{login,set-password,accept-invitation,verify-signup}-chromium-mobile-win32.png` (4 NEU)
- **Expected behavior**: `npm run test:e2e` PASS mit allen 9 Diagnose + 4 Auth-Baselines. Per DEC-152: Auth-Pages-Baselines nur Mobile (4 PNGs, kein Tablet/Desktop).
- **Verification**: `npm run test:e2e` EXIT=0. Diff-Review aller Baseline-Aenderungen vor Commit (visuelle Pruefung dass Anhebung-Diffs erwartet, keine Layout-Brueche).
- **Dependencies**: MT-2 + MT-3 + MT-4.
- **Aufwand**: ~1-2h (Tunnel-Setup + Baseline-Re-Generate + Diff-Review zeitintensiv).

### MT-6: Records-Update + Slice-Schluss
- **Goal**: Slice-Records auf done setzen, /qa-Skill als Folge-Schritt vorbereiten.
- **Files**:
  - `slices/INDEX.md` SLC-143 status `planned → done`
  - `features/INDEX.md` FEAT-062 status `planned → done` (wird `deployed` mit /deploy)
  - `planning/backlog.json` BL-120 status `in_progress → done`
  - `docs/STATE.md` Current-Focus auf SLC-143 DONE, Phase `slice-planning → backend → qa`-Sequenz beendet
- **Expected behavior**: Alle 4 Records-Files reflektieren SLC-143-Done-Stand. RPT-XXX-Eintrag fuer /backend-Pass + /qa-Pass.
- **Verification**: `git status` zeigt 4 Files modified. /qa-Skill kann unmittelbar starten.
- **Dependencies**: MT-1..MT-5.
- **Aufwand**: ~30min.

**Gesamt-Aufwand: ~3-5h Code-Side über 1 Worktree-Session (Full-Session B). Mini-Session A war /requirements + /architecture + /slice-planning, durch.**

## Risks / Dependencies

- **Cascading-Effect-Risk** (DEC-151 + R-V7.4-1): shadcn-Button-Default-Anhebung touchet alle Buttons im Repo ohne `size`-Prop. Mitigation: MT-1 Usage-Audit + MT-5 V7.3-Baselines-Re-Run mit Diff-Review.
- **Footer-Layout-Symmetrie auf Desktop** (A-V7.4-1): Padding-Anhebung koennte Desktop-Footer ueberdimensionieren. Mitigation: MT-3 Visual-Smoke auf 3 Viewports.
- **Baseline-Diff-Threshold-Klaerung** (MT-5 Sub-Decision): Playwright-Default-Threshold 0.2%, Button-Height-Anhebung produziert ~1% Diff → entweder Threshold auf 2% anheben (pragmatisch fragil) oder Baselines komplett re-generieren (sauberer). Empfehlung in MT-5: Baselines re-generieren.
- **Test-Akteur-Aufwand fuer Auth-Pages-Baselines** (MT-5 Sub-Decision): Set-Password / Accept-Invitation / Verify-Signup brauchen Token-Param → dummy-Token rendert ErrorPage-State (baseline-wuerdig fuer Touch-Target-Audit). Login ist public, kein Token noetig.

## Notable Constraints

- Per [.claude/rules/general.md](../.claude/rules/general.md) Rule 3 (Surgical Changes) **NUR** Touch-Target-relevante Aenderungen erlaubt.
- Per [.claude/rules/general.md](../.claude/rules/general.md) Rule 5 (Pattern Reuse) shadcn-cva-Size-Mechanik nutzen, kein eigenes Touch-Target-Pattern.
- Per [.claude/rules/tdd.md](../.claude/rules/tdd.md) SaaS-Mode mandatory TDD — fuer V7.4 reduziert auf Visual-Regression-Baselines als Spezialfall (keine Logik-Tests noetig weil keine Logik geaendert wird).
- Per [.claude/rules/coolify-test-setup.md](../.claude/rules/coolify-test-setup.md) Playwright-MCP-Auth-Tests reuse `tests/e2e/helpers/auth-setup.ts` aus SLC-140.

## Recommended Next Step

`/backend SLC-143 MT-1` als erster Code-Schritt (Pre-Audit, ~30min). Worktree-Erstellung mit `git worktree add -b slc-143-app-shell-auth-pages-polish c:/strategaize/strategaize-onboarding-plattform-slc143 main` vor MT-1-Start.

Note: Trotz "Backend"-Skill-Name handelt es sich bei MT-1..MT-6 um Frontend-/UI-Arbeit. SLC-143 ist ein klassisches **/frontend SLC-143**-Slice — Skill-Wahl bei Bedarf anpassen.
