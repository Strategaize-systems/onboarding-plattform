# SLC-147 — V7.7 Polish-Sammler (ISSUE-082 + ISSUE-077)

**Feature:** — (Polish-Sammler, kein neues FEAT)
**Version:** V7.7
**Status:** planned
**Created:** 2026-05-28
**Estimated effort:** ~1-1.5h Code-Side
**Pre-Conditions:** Keine (V7.5 RELEASED 2026-05-25, V7.6 Knowledge Foundation extern blockiert)
**Worktree:** `slc-147-v77-polish` (Pflicht, SaaS-Mode)

## Zweck

Polish-Iteration nach V7.5-Release. Zwei dokumentierte Low-Severity-Issues aus KNOWN_ISSUES schliessen, die in V7.4-/V7.5-/SLC-019-Slices bewusst out-of-Scope geblieben sind und jetzt mit minimalem Aufwand erledigt werden koennen.

Pattern aus V7.5 Polish-Sammler 1:1 portiert (SLC-144/145/146).

## In Scope

### ISSUE-082 (Low) — Verify-Signup-Pages-Polish
- Custom-styled `<Link>` mit `rounded-md bg-brand-success px-4 py-2 text-sm` (Mobile-Hoehe 36px, Sub-44px-Tap-Area) durch shadcn-`<Button asChild><Link>`-Pattern ersetzen. shadcn-Button-Default-Hoehe per DEC-151 (V7.4): `h-11` = 44px = WCAG-2.1-AA-konform.
- Inline-Footer-Duplikat (Datenschutz + Impressum-Links h=16) entfernen. `StrategaizePoweredFooter` rendert global via `app/layout.tsx` — die Inline-Variante ist Doppel-Render.
- Betroffen: 3 Components in `src/app/auth/verify-signup/_components/`:
  - `ErrorPage.tsx` (1 Custom-Link + 1 Inline-Footer)
  - `InvalidLinkPage.tsx` (1 Custom-Link + 1 Inline-Footer)
  - `ExpiredLinkPage.tsx` (0 Custom-Link, 1 Inline-Footer)

### ISSUE-077 (Low) — Evidence-Upload-Route Helper-Extraktion
- 5 Helper-Symbole (`ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE`, `validateMimeType`, `validateFileSize`, `sanitizeFilename`) aus `src/app/api/capture/[sessionId]/evidence/upload/route.ts` in neue `src/app/api/capture/[sessionId]/evidence/upload/validation.ts` auslagern.
- `route.ts` importiert die 5 Symbole ueber Relative-Import `./validation`. POST-Handler bleibt unveraendert.
- Test-File `src/app/api/capture/[sessionId]/evidence/__tests__/upload-validation.test.ts` Import-Pfad anpassen: `../upload/route` -> `../upload/validation`.
- Effekt: Next 16 Webpack-strict-validation akzeptiert `route.ts` (zur Zeit nur Coolify-Default-Turbopack-Build sauber, Webpack-Build failt lokal pre-existing seit SLC-019).

## Out of Scope

- ISSUE-073 (IMPRESSUM_VAT-Platzhalter) — externe User-Pflicht, kein Code-Fix moeglich.
- Andere Auth-Pages-Polish (Set-Password, Accept-Invitation, Login) — gehoeren in eigene Iteration.
- shadcn-Button-Style-Guide-Anpassung — DEC-151 ist live, Default-Hoehe h=11 = 44px wird hier nur konsumiert.
- Local-FileUploadZone.tsx hat eigene `MAX_FILE_SIZE` (20 MB, hardcoded line 8) — bleibt unangetastet, weil unabhaengig vom route.ts-Export.
- `src/lib/validations.ts` hat eigene `MAX_FILE_SIZE` (200 MB, anderer Use-Case) — bleibt unangetastet, keine Kollision.

## Micro-Tasks

### MT-1: ISSUE-082 Verify-Signup-Pages-Polish
- Goal: 3 Components auf shadcn-Button + Footer-Single-Source-of-Truth bringen.
- Files: 
  - `src/app/auth/verify-signup/_components/ErrorPage.tsx` (Edit: Custom-Link -> `<Button asChild><Link>`, Inline-Footer-Div entfernen)
  - `src/app/auth/verify-signup/_components/InvalidLinkPage.tsx` (Edit: Custom-Link -> `<Button asChild><Link>`, Inline-Footer-Div entfernen)
  - `src/app/auth/verify-signup/_components/ExpiredLinkPage.tsx` (Edit: Inline-Footer-Div entfernen)
- Expected behavior: 
  - "Zur Anmeldung"-Button rendert als shadcn-Button mit DEC-151-Default-Hoehe h=11 (44px).
  - Visuelle Konsistenz mit anderen Strategaize-Auth-Pages (Login etc.).
  - StrategaizePoweredFooter rendert nur 1x pro Page (via app/layout.tsx).
  - Card-Layout bleibt unveraendert (max-w-md, centered, mit gradient-Stripe top).
- Verification: 
  - tsc EXIT=0 + ESLint EXIT=0.
  - Visual-Side-by-Side im Code-Review (kein Vitest da pure UI-Komponenten ohne Logic).
  - Live-Smoke nach Master-Merge: 3 URL-Patterns aufrufen mit dummy/invalid Token.
- Dependencies: Keine.

### MT-2: ISSUE-077 Evidence-Upload-Route Helper-Extraktion
- Goal: 5 Helper-Symbole in `validation.ts`-Modul auslagern.
- Files:
  - `src/app/api/capture/[sessionId]/evidence/upload/validation.ts` (NEU — 5 Exports: `ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE`, `validateMimeType`, `validateFileSize`, `sanitizeFilename`)
  - `src/app/api/capture/[sessionId]/evidence/upload/route.ts` (Edit: Helper-Definitionen entfernen, Import von `./validation` ergaenzen)
  - `src/app/api/capture/[sessionId]/evidence/__tests__/upload-validation.test.ts` (Edit: Import-Pfad `../upload/route` -> `../upload/validation`)
- Expected behavior: 
  - POST-Handler in route.ts unveraendert, Funktionalitaet identisch.
  - Next 16 Webpack-strict-validation akzeptiert route.ts (nur valid Route-Exports: `POST`).
  - Vitest upload-validation.test.ts laeuft mit neuem Import-Pfad gruen (alle ~25 Cases).
- Verification: 
  - tsc EXIT=0 + ESLint EXIT=0.
  - `npm run test -- upload-validation` PASS.
  - Grep-Audit: kein weiterer Re-Importer der 5 Symbole von `route.ts` (cross-check: nur `FileUploadZone.tsx` hat eigene `MAX_FILE_SIZE`-Const, kein Import von route.ts).
- Dependencies: Keine.

### MT-3: Records-Update
- Goal: Cockpit-Records auf SLC-147-done, ISSUE-082 + ISSUE-077 resolved.
- Files:
  - `slices/INDEX.md` (V7.7-Section + SLC-147-Row -> done)
  - `planning/backlog.json` (2 neue BL-Items angelegt + status=done)
  - `planning/roadmap.json` (V7.7-Eintrag status=released nach Master-Merge)
  - `docs/STATE.md` (Current Focus + Phase)
  - `docs/KNOWN_ISSUES.md` (ISSUE-082 + ISSUE-077 -> resolved mit Resolution Date 2026-05-28 + Resolution Slice SLC-147)
  - `docs/RELEASES.md` (REL-025 V7.7 Polish-Sammler)
- Expected behavior: Cockpit zeigt SLC-147 done, ISSUE-082 + ISSUE-077 resolved.
- Verification: Cockpit-Refresh nach commit+push.
- Dependencies: MT-1 + MT-2 PASS.

## Acceptance Criteria

**AC-SLC-147-1**: 3 Verify-Signup-ErrorPage-Components nutzen shadcn-Button statt Custom-styled Link. Touch-Target Submit-Buttons >=44px (DEC-151).

**AC-SLC-147-2**: 0 Inline-Footer-Duplikate in `/auth/verify-signup`-ErrorPage-States. Nur globaler `StrategaizePoweredFooter` rendert.

**AC-SLC-147-3**: `src/app/api/capture/[sessionId]/evidence/upload/route.ts` exportiert ausschliesslich Next.js Route-konforme Symbole (POST). Keine Helper-/Constants-Exports.

**AC-SLC-147-4**: `validation.ts` exportiert 5 Helper/Constants. `upload-validation.test.ts` importiert von `../upload/validation`, alle Tests PASS.

**AC-SLC-147-5**: Quality-Gates (tsc + ESLint + Vitest SLC-147-Scope) alle gruen.

## Risiken

- shadcn-Button-Variant-Default ("default") nutzt `bg-primary` — alte Custom-Variante war `bg-brand-success` (eher gruener). Visual-Drift moeglich. Mitigation: Wenn der Test-User visual-pruefen will, kann der Button-Variant zu `"default"` oder `"success"` (sofern existent) angepasst werden. Default-Wahl: `"default"` (Strategaize-Brand-Primary). Wenn ein `"success"`-Variant existiert, prueferiere diese fuer Markenkonsistenz.
- ExpiredLinkPage hat keinen Submit-Button — Card endet mit Footer. Nach Footer-Removal hat die Card weniger Vertikal-Inhalt. Mitigation: `pb-8`-Padding bleibt, Card sieht weniger gefuellt aus aber strukturell ok.
- Test-Import-Pfad-Aenderung in upload-validation.test.ts darf kein anderer Test breaken (Grep-Audit).

## Reuse-Pflicht

- shadcn-`<Button asChild>`-Pattern wie in V7.4 SLC-143 etabliert (DEC-151).
- `<Link>` aus `next/link` (Server-Component-Pattern).
- Keine neuen Tailwind-Klassen, nur shadcn-Default-Variants.

## Cockpit-Felder

- Feature-Spalte in slices/INDEX.md: `ISSUE-082 + ISSUE-077`
- BL-Items: `BL-125` (ISSUE-082-Fix) + `BL-126` (ISSUE-077-Fix)

## Worktree-Strategie

- Branch: `slc-147-v77-polish` (rebased von main)
- Worktree-Pfad: `c:/strategaize/strategaize-onboarding-plattform-slc147`
- Junction-Setup fuer node_modules (Windows): `cmd /c mklink /J node_modules ..\strategaize-onboarding-plattform\node_modules` (per Reference `reference_worktree_nodemodules_junction_windows`)
- Master-Merge nur nach Slice-Schluss-/qa PASS (kein iteratives Mergen per `feedback_slice_merge_at_end`).
