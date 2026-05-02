# SLC-053 — Convention + Tooling-Migrations (`middleware`→`proxy` + ESLint-9 flat-config)

## Goal
Zwei strukturell verwandte Tooling-Migrations bundeln und als ersten V4.3-Slice ausfuehren, sodass nachfolgende Slices auf stabilem Tooling laufen. (a) Next.js 16 `middleware`-Convention auf `proxy` umstellen (Build-Deprecation-Warning verschwindet, Auth-Middleware-Tests bleiben gruen). (b) ESLint 9 flat-config-Migration mit Pre/Post Lint-Output-Snapshots fuer Drift-Erkennung. Migration-Risiko zuerst per DEC-062.

## Feature
V4.3 Maintenance

## Backlog Items
- BL-059 Next.js 16 middleware->proxy Convention-Migration
- BL-064 ESLint 9 flat-config-Migration

## In Scope

### A — `middleware` → `proxy` Convention-Migration (BL-059)

Pfad: `src/middleware.ts` (umbenennt zu `src/proxy.ts`)
Pfad: `src/proxy.ts` (geaendert, Convention-Anpassungen falls Next 16 API geaendert)

Verhalten:
- 1:1-Rename `src/middleware.ts` → `src/proxy.ts` per `git mv`.
- Next 16 Migration-Guide pruefen — `proxy`-Convention nutzt evtl. neue Export-Namen (`export default proxy` statt `export default middleware`) oder neue NextRequest/NextResponse-API. Pruefen via `npx next build` + Build-Output-Diff.
- `next.config.ts` bzw `next.config.mjs` pruefen — eventuelle `experimental.middleware`-Felder entfernen.
- Auth-Middleware-Tests existieren seit V1 (`src/middleware.test.ts` ggf. zu `src/proxy.test.ts`). Tests bleiben 100% PASS-Pflicht (SC-V4.3-4).

### B — ESLint 9 flat-config-Migration (BL-064)

Pfad: `eslint.config.mjs` (neu)
Pfad: `.eslintrc.json` (loescht nach Verifikation)
Pfad: `package.json` (geaendert: `lint`-Script ggf. anpassen)

Verhalten:
- Pre-Migration: aktuelles `npm run lint`-Verhalten dokumentieren (failt mit `eslint.config.(js|mjs|cjs) file not found` per BL-064-Beschreibung). Falls noch ein alter Lint-Run moeglich (z.B. `npx eslint src/`-direct), Pre-Output-Snapshot speichern.
- `eslint.config.mjs` mit flat-config-Schema:
  - Erst pruefen ob `eslint-config-next@^16` native flat-config liefert (Q-V4.3-J).
  - Falls ja: direkt `import nextConfig from 'eslint-config-next'` und `export default [...nextConfig]`.
  - Falls nein: `FlatCompat`-Adapter aus `@eslint/eslintrc` nutzen, in `eslint.config.mjs` als bewusste Brueckenloesung dokumentieren (Inline-Kommentar mit Begruendung).
- `.eslintrc.json` nach erfolgreicher Verifikation loeschen.
- `npm run lint` muss fehlerfrei laufen (kein Crash; Warnings akzeptiert solange dokumentiert).
- Post-Migration: Lint-Output-Snapshot erfassen + mit Pre-Snapshot vergleichen (R-V4.3-3-Mitigation).

### C — Tests + Verification

- Pflicht: Auth-Middleware/Proxy-Tests bleiben 100% PASS (`npm run test src/proxy.test.ts` falls Test existiert).
- Pflicht: `npm run lint` exit code 0.
- Pflicht: `npm run build` exit code 0 + keine `middleware is deprecated`-Warning mehr im Build-Output.
- Optional: `npm audit --omit=dev` Pre/Post-Diff (kein neues Vuln-Finding).

## Out of Scope

- Refactoring der Auth-Logik (rein Convention-Migration).
- Andere ESLint-Plugin-Erweiterungen (z.B. Tailwind-Plugin) — V4.3 ist Maintenance, nicht Erweiterung.
- TypeScript-strict-Mode-Verschaerfungen.
- Husky/Pre-Commit-Hook-Setup.

## Acceptance Criteria

- AC-1: `src/middleware.ts` ist umbenannt zu `src/proxy.ts` per `git mv`. History bleibt erhalten.
- AC-2: `npm run build` zeigt keine `middleware file convention is deprecated`-Warning.
- AC-3: Auth-Middleware-Tests laufen unter dem neuen Namen 100% PASS.
- AC-4: `eslint.config.mjs` existiert mit flat-config-Schema und `.eslintrc.json` ist geloescht.
- AC-5: `npm run lint` laeuft fehlerfrei (exit code 0).
- AC-6: Pre/Post Lint-Output-Snapshots sind im Slice-Report dokumentiert (R-V4.3-3-Mitigation).
- AC-7: `npm run build` succeeds (exit code 0).
- AC-8: V4.2-Auth-Flow funktioniert weiter (User kann sich einloggen, /accept-invitation funktioniert, /admin/* requireRole greift).
- AC-9: Falls `FlatCompat`-Adapter genutzt: bewusste DEC im Slice-Report dokumentiert mit Hinweis "auf native flat-config umstellen sobald `eslint-config-next` upstream nachzieht".
- AC-10: `npm run test` gruen.

## Dependencies

- Vorbedingung: Keine. SLC-053 ist erster V4.3-Slice per DEC-062 Reihenfolge.
- Nachfolge-Slices SLC-051, 052, 055, 056, 054 profitieren von stabilem Tooling.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine. Tooling-Migration ist Code-Layer, kein Schema-Touch.

## Pflicht-QA-Vorgaben

- Pre-Migration Lint-Output-Snapshot erfasst + im Slice-Report dokumentiert (R-V4.3-3-Mitigation).
- Post-Migration Lint-Output-Snapshot + Diff-Analyse + Slice-Report-Eintrag.
- Auth-Middleware/Proxy-Tests 100% PASS.
- `npm run build` exit 0 + keine Deprecation-Warning fuer middleware.
- `npm run lint` exit 0.
- `npm run test` exit 0.
- Browser-Smoke: Login-Flow funktioniert (User kann auf /dashboard zugreifen, Auth-Cookie wird gesetzt).
- 4-Rollen-RLS-Matrix bleibt 100% PASS (kein DB-Touch).
- V4.2-Regression-Smoke (Wizard, Cron, Help-Sheet erreichbar).
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — Next 16 `proxy`-API hat Breaking Changes:** Mitigation = Next 16 Migration-Guide vor MT-1 lesen + Build-Output-Pruefung. Falls API-Anpassungen noetig, dokumentieren als zweite MT (MT-1b).
- **R2 — `eslint-config-next@^16` nicht native flat-config-kompatibel:** Mitigation = `FlatCompat`-Adapter-Layer als bewusste Zwischenloesung mit Inline-Kommentar; Folge-BL fuer "auf native flat-config wechseln sobald upstream verfuegbar" anlegen.
- **R3 — Lint-Output-Drift findet neue Warnings:** Mitigation = im Slice-Report kategorisieren (real-Bug-Hint vs. Style-Warning-Drift); echte Bug-Hints werden als Folge-BL angelegt, Style-Drift-Warnings akzeptiert.
- **R4 — Tests nutzen alten Path `src/middleware.ts`:** Mitigation = vor MT-1 grep auf `middleware`-String-Imports/-Pfade, betroffene Stellen mit-renamen.

## Detail-Decisions aus /architecture (V4.3)

- DEC-062 (Slice-Bundling): SLC-053 ist Tooling-Migration-Bundle als ERSTER V4.3-Slice (Migration-Risiko zuerst).
- Q-V4.3-J (FlatCompat-Adapter): erst pruefen, ob `eslint-config-next@^16` native flat-config liefert. Adapter als Fallback mit DEC im Slice-Report.

### Micro-Tasks

#### MT-1: middleware → proxy Rename + Next 16 Convention-Anpassung
- Goal: Next.js 16 `proxy`-Convention adaptieren.
- Files: `src/middleware.ts` → `src/proxy.ts` (git mv), `next.config.*` (geprueft + ggf. geaendert), evtl. Test-Imports
- Expected behavior: `npm run build` zeigt keine middleware-Deprecation-Warning. Auth-Flow unveraendert.
- Verification: Build-Output ohne Warning + Browser-Login-Smoke.
- Dependencies: none.

#### MT-2: Auth-Middleware-Tests Path-Update
- Goal: Test-File-Imports + Test-Path auf `proxy.ts` umstellen.
- Files: `src/middleware.test.ts` → `src/proxy.test.ts` (falls existiert), Test-Imports `src/proxy`-Pfad korrigieren
- Expected behavior: `npm run test` 100% PASS auf umbenannten Tests.
- Verification: Vitest-Run gruen.
- Dependencies: MT-1.

#### MT-3: Lint-Output-Pre-Migration-Snapshot
- Goal: Aktuelles Lint-Output dokumentieren (auch wenn ESLint mit alter Config laeuft).
- Files: keine — Slice-Report-Eintrag mit Lint-Output-Excerpt.
- Expected behavior: Vor SLC-053-Migration ist klar, welcher Lint-Status existiert.
- Verification: Slice-Report enthaelt Pre-Snapshot.
- Dependencies: none.

#### MT-4: ESLint flat-config-Migration
- Goal: `eslint.config.mjs` mit flat-config-Schema + `.eslintrc.json` Loeschung.
- Files: `eslint.config.mjs` (neu), `.eslintrc.json` (geloescht), `package.json` (Lint-Script ggf. angepasst)
- Expected behavior: `npm run lint` exit 0. Falls FlatCompat noetig: bewusste DEC im Slice-Report.
- Verification: `npm run lint` + Slice-Report-Eintrag.
- Dependencies: MT-3.

#### MT-5: Lint-Output-Post-Migration-Snapshot + Diff-Analyse
- Goal: Post-Migration Lint-Output dokumentieren + Drift-Klassifikation.
- Files: keine — Slice-Report-Eintrag mit Pre/Post-Diff.
- Expected behavior: Drift ist kategorisiert (Bug-Hint vs. Style-Warning).
- Verification: Slice-Report enthaelt Post-Snapshot + Diff-Analyse.
- Dependencies: MT-4.

#### MT-6: Build + Test + Browser-Smoke-Verifikation
- Goal: Pflicht-AC-Verifikation: `npm run build` ohne Deprecation, `npm run test` gruen, Browser-Login-Smoke.
- Files: keine — Slice-Report-Eintrag mit Verifikations-Output.
- Expected behavior: Alle Pflicht-Gates PASS.
- Verification: Build/Test-Logs + Login-Smoke-Beleg.
- Dependencies: MT-1 + MT-2 + MT-4.
