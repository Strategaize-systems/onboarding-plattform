# SLC-002 — Rollen-Umbenennung tenant_owner → tenant_admin

- Feature: FEAT-001
- Status: planned
- Priority: Blocker
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Kanonisches Rollen-Naming herstellen: `tenant_owner` (Blueprint-Erbe) wird ueberall zu `tenant_admin` (DEC-010). Betrifft DB-Enum/Check, RLS-Helpers, Code, Tests.

## In Scope
- Migration 026: Rename Role-Values in `auth.user_role()`-Helper und in `tenant_members.role` Enum/Check
- Code-Rename: alle Vorkommen `'tenant_owner'` → `'tenant_admin'` in `src/**`
- RLS-Policies aus SLC-001 verifizieren (sollten bereits `tenant_admin` verwenden, aber SLC-001 + Blueprint-Bestands-Policies nebeneinander pruefen)
- Tests anpassen / erweitern

## Out of Scope
- Einfuehrung neuer Rollen wie `tenant_editor` (V2+)
- UI fuer Rollen-Verwaltung (Blueprint-UI bleibt)

## Acceptance
- Kein Vorkommen von `tenant_owner` mehr im Repo (ausser in Migration-Historie und `/docs/MIGRATIONS.md`-Eintrag)
- Migration 026 auf Hetzner ausgefuehrt
- Bestehende Tenant-User behalten nach Migration dieselben Rechte
- `npm run test` gruen

## Dependencies
- SLC-001 (fuer RLS-Helpers)

## Risks
- Session-Cookies existierender User enthalten evtl. `role: 'tenant_owner'` im JWT — bei naechstem Login wird das neu gesetzt, bis dahin Fallback noetig? → Migration setzt DB-Wert um; JWT refresht bei naechstem `@supabase/ssr`-Call. Dokumentieren.
- Breite Code-Aenderung — Gefahr, dass String-Vorkommen in Kommentaren / Tests uebersehen werden

## Micro-Tasks

### MT-1: Migration 026 — DB-Rename
- Goal: `tenant_owner` in allen DB-Constraints und Enum-Werten auf `tenant_admin` umbenennen.
- Files: `sql/migrations/026_rename_tenant_owner_to_admin.sql`
- Expected behavior: `UPDATE tenant_members SET role = 'tenant_admin' WHERE role = 'tenant_owner';` plus Check-Constraint-Anpassung falls vorhanden.
- Verification: `SELECT DISTINCT role FROM tenant_members` zeigt kein `tenant_owner`.
- Dependencies: SLC-001 deployed

### MT-2: Code-Rename tenant_owner → tenant_admin
- Goal: Alle String-Vorkommen in TS-Code umbenennen.
- Files: betrifft voraussichtlich `src/lib/auth/*`, `src/middleware.ts`, UI-Komponenten mit Rollen-Checks (konkrete Liste bei Implementation ermitteln via `grep`)
- Expected behavior: Lint + Build gruen; Type-Checks gruen; keine String-Literale `'tenant_owner'` mehr.
- Verification: `grep -r "tenant_owner" src/` leer; `npm run build`; `npm run test`.
- Dependencies: MT-1

### MT-3: JWT-Refresh-Hinweis dokumentieren
- Goal: Deployment-Hinweis in `docs/KNOWN_ISSUES.md` oder `docs/RELEASES.md`, dass Nutzer sich einmal neu anmelden muessen, damit das `role`-Claim im JWT aktualisiert.
- Files: `docs/KNOWN_ISSUES.md`
- Expected behavior: ISSUE-Eintrag `ISSUE-002` (oder naechste Nummer) mit Status `open` und `Next Action: nach Deploy Auto-Logout-Flag setzen oder Nutzer benachrichtigen`.
- Verification: Parser-Format nach `project-records-format.md`.
- Dependencies: MT-1

### MT-4: RLS-Tests aus SLC-001 gegen neue Rolle verifizieren
- Goal: Integrationstest `rls-isolation.test.ts` pruefen, ob er `tenant_admin` statt `tenant_owner` verwendet.
- Files: `src/lib/db/__tests__/rls-isolation.test.ts`
- Expected behavior: Test bleibt gruen, nutzt `tenant_admin`.
- Verification: `npm run test -- rls-isolation` gruen.
- Dependencies: MT-2

## Verification Summary
- `grep -r "tenant_owner" src/` liefert 0 Treffer
- `npm run test` + `npm run build` gruen
- Migration 026 auf Hetzner done
