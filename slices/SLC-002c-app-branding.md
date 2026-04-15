# SLC-002c — App-Branding Onboarding-Plattform

- Feature: FEAT-001 (Foundation / Cross-cutting UI)
- Status: planned
- Priority: Medium
- Created: 2026-04-15
- Delivery Mode: SaaS
- Worktree: ja

## Goal
Blueprint-Erbe (Titles, Meta, Logo-Referenzen, Copy-Snippets) aus der Onboarding-App entfernen und durch Onboarding-eigene Branding-Strings ersetzen. Aufloesung von ISSUE-005 "App-Title StrategAIze Kundenplattform" aus dem SLC-001-QA.

## In Scope
- `<title>` der App (Root-Layout, `app/layout.tsx` oder equivalent)
- `<meta name="description">`
- Open-Graph-Tags
- Footer-Text (falls vorhanden) — "Onboarding-Plattform" statt "Kundenplattform"
- Login-Seite Heading
- `package.json` `name`-Feld — `strategaize-onboarding-plattform`
- `manifest.json` / PWA-Metadata (falls vorhanden)
- Favicon-Datei austauschen (falls Blueprint-Logo drin ist)
- README-Titel-Zeile

## Out of Scope
- Komplettes Re-Design der UI (V1 uebernimmt Blueprint-Layout bewusst 1:1)
- Neues Logo-Asset (falls keins vorliegt, aktuelles Strategaize-Logo verwenden)
- Mehrsprachigkeit
- Theming / Dark Mode
- Mail-Templates (kommen mit SLC-005/006 Invite-Flow)

## Acceptance
- Keine Blueprint-Referenzen mehr im User-sichtbaren Text (`grep -r "Blueprint" src/ app/ public/` liefert nur noch Historische / Comment-Treffer)
- Browser-Tab zeigt "Onboarding-Plattform" oder "StrategAIze Onboarding"
- Login-Seite rendert neutrale Onboarding-Copy
- Lighthouse / Meta-Check: Description + OG-Tags passen zum neuen Produkt
- Build + Deploy ohne Regressionen
- ISSUE-005 auf `resolved` gesetzt

## Dependencies
- SLC-002 (optional — reine UI, kann auch parallel)

## Risks
- Kleine Kosmetik-Aenderungen sind schnell, aber es gibt viele Stellen, an denen "StrategAIze Kundenplattform" oder "Blueprint" versteckt sein kann (Email-Templates, Toasts, Error-Messages, Cookie-Hinweis-Text).
- Favicon-Cache im Browser zeigt evtl. altes Icon — Hard-Refresh-Hinweis noetig.

## Micro-Tasks

### MT-1: Branding-Audit
- Goal: Alle Blueprint-Referenzen im Repo finden.
- Files: keine Aenderung — nur Grep-Report in Slice-Completion
- Expected behavior: Liste aller Treffer fuer `Blueprint`, `Kundenplattform`, `blueprint.strategaize` in `app/`, `src/`, `public/`, `package.json`, `README.md`.
- Verification: Liste ist vollstaendig (manueller Review).
- Dependencies: none

### MT-2: Metadata + Root-Layout
- Goal: Haupt-Title, Description, OG-Tags austauschen.
- Files: `src/app/layout.tsx` (oder `app/layout.tsx`), ggf. `src/app/head.tsx`
- Expected behavior: `<title>` und `<meta>` zeigen Onboarding-Strings.
- Verification: `curl -s https://onboarding.strategaizetransition.com | grep -i title` liefert neuen Title.
- Dependencies: MT-1

### MT-3: Login + UI-Copy
- Goal: Login-Seite und sichtbare UI-Strings.
- Files: `src/app/login/page.tsx` (oder vergleichbar), ggf. `src/components/layout/*`
- Expected behavior: Keine "Blueprint"-Worte im sichtbaren UI.
- Verification: Browser-Screenshot der Login-Seite zeigt neutrale Copy.
- Dependencies: MT-1

### MT-4: package.json + README + Assets
- Goal: Repo-Metadata + statische Assets.
- Files: `package.json`, `README.md`, `public/favicon.ico` (falls Blueprint-Logo)
- Expected behavior: `npm pkg get name` liefert `strategaize-onboarding-plattform`. README Titel erneuert. Favicon austauscht falls noetig.
- Verification: visueller Check.
- Dependencies: MT-1

### MT-5: Deploy + ISSUE-Update
- Goal: Aenderungen live + Issue schliessen.
- Files: `docs/KNOWN_ISSUES.md`
- Expected behavior: Redeploy durch, Title in Browser korrekt, ISSUE-005 Status `resolved`.
- Verification: Live-Check auf Domain.
- Dependencies: MT-2, MT-3, MT-4

## Verification Summary
- Grep-Report zeigt 0 ungewollte Blueprint-Referenzen im sichtbaren UI
- Browser-Tab + Login-Seite zeigen Onboarding-Branding
- ISSUE-005 geschlossen
- Redeploy erfolgreich
