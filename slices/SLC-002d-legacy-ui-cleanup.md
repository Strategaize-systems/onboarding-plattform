# SLC-002d — Blueprint-Legacy-UI-Cleanup

- Feature: FEAT-001
- Status: planned
- Priority: Medium
- Created: 2026-04-16
- Delivery Mode: SaaS (TDD optional — reine Deletions, keine neuen Behaviours)
- Worktree: ja

## Goal
Die Blueprint-geerbten UI- und API-Flaechen entfernen, die im Onboarding-Plattform-V1-Scope nicht mehr benoetigt werden und beim realen Smoketest stoeren (ISSUE-009) oder tote Pfade produzieren (ISSUE-008). Damit ist der Code-Pfad ab SLC-003 (Template/Questionnaire) frei von Blueprint-spezifischen Umwegen.

## In Scope
- Entfernen `src/app/profile/page.tsx`, `src/app/profile/profile-form-client.tsx`
- Entfernen `src/app/api/tenant/profile/route.ts`
- Entfernen `src/components/profile/` Verzeichnis (leadership-select, disc-select, ...)
- Entfernen i18n-Keys `profile.*` in `messages/de.json` und `messages/en.json` (falls beide existieren)
- Entfernen jegliche Redirects auf `/profile` (vermutlich in Middleware oder Dashboard) — die Login-Action redirected nach `/dashboard`, wenn die Weiterleitung auf `/profile` noch irgendwo sitzt, muss sie weg
- Entfernen `src/app/api/tenant/runs/[runId]/feedback/route.ts` (ISSUE-008)
- Entfernen `src/app/api/tenant/transcribe/` falls es nur fuer Profile-Voice genutzt wurde (sonst erhalten, wird fuer spaeter Voice-Capture gebraucht)
- Aktualisierung `docs/KNOWN_ISSUES.md`: ISSUE-008 + ISSUE-009 auf `Status: resolved` setzen

## Out of Scope
- Andere Blueprint-Legacy-UI-Flaechen, die nicht ISSUE-008/009 betreffen (werden bei Bedarf in eigenen Slices adressiert)
- Owner-Profile als Template-spezifische Erhebung wiedereinfuehren — das ist V2+ und gehoert in einen Template-Slice, nicht hierher
- Dashboard-Neu-Design — reines Deletions-Slice, nicht Redesign
- Blueprint-Legacy-Migrations im `sql/migrations/`-Ordner (ISSUE-006) — separater Maintenance-Slice

## Acceptance
- `/profile` liefert HTTP 404 (oder wird durch Middleware auf `/dashboard` redirected)
- `PUT /api/tenant/profile` liefert HTTP 404
- `PUT /api/tenant/runs/<id>/feedback` liefert HTTP 404
- `npm run build` laeuft ohne Fehler (keine broken Imports)
- `npm run test` laeuft ohne Fehler (keine Referenzen auf entfernte Module)
- Login mit beiden Seed-Credentials funktioniert, beide User landen auf `/dashboard` ohne Umweg ueber `/profile`
- ISSUE-008 + ISSUE-009 auf `resolved` in KNOWN_ISSUES.md

## Dependencies
- SLC-002b (Seed-User vorhanden, um Login-Flow manuell zu testen)

## Risks
- Middleware-Weiterleitung auf `/profile` koennte an nicht-offensichtlicher Stelle sitzen (z.B. in einem Dashboard-Layout oder einem Auth-Hook). Sorgfaeltig grep'en: `"/profile"`, `push.*profile`, `redirect.*profile`.
- `components/profile/leadership-select.tsx` + `disc-select.tsx` enthalten shadcn/ui-Patterns, die anderswo wiederverwendet werden koennten. Grep vor Loeschen, um zu prueffen ob Imports ausserhalb `src/app/profile/` bestehen.

## Micro-Tasks

### MT-1: Grep + Audit aller /profile-Referenzen
- Goal: Vollstaendige Liste aller Code-Referenzen, die mitgedroppt werden muessen.
- Files: nur lesend (grep-Output als Plan-Grundlage)
- Expected output: Liste aller Imports von `@/components/profile/*`, aller `redirect("/profile")`-Stellen, aller i18n-Keys `profile.*`.
- Dependencies: none

### MT-2: UI + API loeschen
- Goal: Alle Files aus In-Scope Liste entfernen.
- Files: siehe oben
- Verification: `npm run build` laeuft durch.
- Dependencies: MT-1

### MT-3: Redirect-Kette pruefen
- Goal: Post-Login-Redirect landet bei `/dashboard`, nicht mehr bei `/profile`.
- Files: abhaengig von Audit-Ergebnis — evtl. `src/middleware.ts`, `src/app/dashboard/page.tsx`, `src/lib/supabase/middleware.ts`
- Verification: Login mit beiden Seed-Credentials -> direkter Sprung zu `/dashboard`
- Dependencies: MT-2

### MT-4: ISSUE-008 + ISSUE-009 schliessen
- Goal: KNOWN_ISSUES-Eintraege auf resolved + ResolutionDate 2026-04-16.
- Files: `docs/KNOWN_ISSUES.md`
- Dependencies: MT-3

### MT-5: Deploy + manueller Smoketest
- Goal: Redeploy, Login beider User erfolgreich, kein /profile-Umweg mehr.
- Files: keine Code-Aenderung, nur Coolify + Verifikation
- Dependencies: MT-4

## Verification Summary
- Build gruen ohne broken Imports
- Tests gruen
- Deploy auf Hetzner, Login beider Seed-User -> `/dashboard` direkt
- KNOWN_ISSUES aktualisiert (ISSUE-008 + ISSUE-009 resolved)
