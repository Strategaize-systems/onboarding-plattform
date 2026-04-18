# SLC-012 — Dashboard Capture-Sessions + Error-Logging

## Zuordnung
- Feature: FEAT-008 (Dashboard Capture-Sessions), FEAT-009 (Error-Logging)
- Version: V1.1
- Priority: High
- Loest: ISSUE-012, ISSUE-013

## Ziel
Dashboard zeigt aktive Capture-Sessions statt leere Blueprint-Runs. Error-Logging funktioniert (error_log-Tabelle existiert in DB).

## Scope
- dashboard-client.tsx auf capture_session-Query umbauen
- Migration 039_error_log.sql erstellen und auf Hetzner ausfuehren
- Dashboard i18n-Keys anpassen
- Build-Verifikation + Deploy

## Nicht in Scope
- Dashboard-Redesign (Layout bleibt gleich, nur Datenquelle aendert sich)
- Error-Log-Admin-UI (existiert bereits unter /api/admin/errors)
- Voice-Input (ISSUE-014, V2)

## Acceptance Criteria
1. tenant_admin sieht nach Login seine Capture-Sessions mit Template-Name, Status, letztem Update
2. Klick auf Session fuehrt zu `/capture/{sessionId}`
3. Empty-State wird korrekt angezeigt wenn keine Sessions existieren
4. `error_log`-Tabelle existiert in Onboarding-DB
5. Ein provozierter Fehler erzeugt einen Eintrag in error_log
6. `/api/admin/errors` liefert Fehler-Eintraege

### Micro-Tasks

#### MT-1: Migration 039_error_log.sql erstellen
- Goal: error_log-Tabelle mit RLS-Policy erstellen
- Files: `sql/migrations/039_error_log.sql`
- Expected behavior: Tabelle error_log mit Spalten id, level, source, message, stack, metadata, user_id, created_at. RLS aktiv, nur strategaize_admin liest.
- Verification: SQL-Syntax korrekt, Migration-Datei existiert
- Dependencies: none

#### MT-2: Migration auf Hetzner ausfuehren
- Goal: error_log-Tabelle auf Produktions-DB erstellen
- Files: keine Code-Aenderung
- Expected behavior: `\d error_log` auf Hetzner-DB zeigt korrekte Tabelle
- Verification: `docker exec ... psql -U postgres -d postgres -c "\d error_log"`
- Dependencies: MT-1

#### MT-3: Dashboard-Client auf capture_session umbauen
- Goal: dashboard-client.tsx nutzt Supabase-Client statt /api/tenant/runs
- Files: `src/app/dashboard/dashboard-client.tsx`
- Expected behavior: Dashboard zeigt capture_session-Liste mit template.name, status, started_at, updated_at. Links zu /capture/{sessionId}.
- Verification: `npm run build` erfolgreich
- Dependencies: none

#### MT-4: Dashboard i18n-Keys anpassen
- Goal: Dashboard-Texte fuer Capture-Sessions statt Runs
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Dashboard-Texte referenzieren "Erhebungen" statt "Runs/Assessments"
- Verification: Keine fehlenden i18n-Keys im Build
- Dependencies: MT-3

#### MT-5: Build + Deploy-Verifikation
- Goal: Build erfolgreich, Coolify-Redeploy, Dashboard + error_log Live-Test
- Files: keine neuen Aenderungen
- Expected behavior: Dashboard zeigt Sessions, error_log funktioniert
- Verification: Browser-Test + DB-Query auf error_log
- Dependencies: MT-2, MT-3, MT-4
