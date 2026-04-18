# SLC-011 — Blueprint-Legacy-Cleanup

## Zuordnung
- Feature: FEAT-007 (Blueprint-Legacy-Cleanup)
- Version: V1.1
- Priority: High
- Loest: ISSUE-011, ISSUE-006, ISSUE-003

## Ziel
Alle Blueprint-Legacy-Dateien und -Migrations aus dem Repo entfernen. Nach Abschluss soll `grep -r "from.*runs\b" src/app/api/` 0 Treffer liefern und `npm run build` erfolgreich sein.

## Scope
- ~42 tote Dateien loeschen (API-Routes, Pages, Client-Components)
- 16 Legacy-Migrations (003-020) loeschen
- Verwaiste Imports/Components pruefen und bereinigen
- `npm install` lokal ausfuehren (ISSUE-003)
- Build-Verifikation

## Nicht in Scope
- Dashboard-Umbau (SLC-012)
- error_log-Migration (SLC-012)
- Aenderungen an llm.ts (buildOwnerContext bleibt per DEC-012)
- Aenderungen an freeform.ts (bleibt fuer V2 BL-021)

## Acceptance Criteria
1. Verzeichnisse `src/app/api/tenant/runs/`, `src/app/api/admin/runs/`, `src/app/api/admin/catalog/`, `src/app/api/tenant/mirror/`, `src/app/admin/runs/`, `src/app/admin/catalog/`, `src/app/mirror/profile/`, `src/app/mirror/nominations/`, `src/app/mirror/policy/`, `src/app/runs/` existieren nicht mehr
2. `sql/migrations/` enthaelt nur Migrations 021+ (kein 003-020)
3. `npm run build` erfolgreich
4. `npm run test` erfolgreich (soweit lokal verfuegbar)
5. Keine verwaisten Imports (Build wuerde brechen)

### Micro-Tasks

#### MT-1: npm install lokal + Baseline-Build
- Goal: Lokale Dev-Umgebung aufsetzen, Build-Baseline herstellen
- Files: `package-lock.json` (aktualisiert)
- Expected behavior: `npm install` laeuft durch, `npm run build` ist erfolgreich
- Verification: `npm run build` exit 0
- Dependencies: none

#### MT-2: Grep-Audit — Import-Abhaengigkeiten pruefen
- Goal: Vor Loeschung pruefen, welche Legacy-Dateien von aktiven Dateien importiert werden
- Files: keine Aenderungen, nur Analyse
- Expected behavior: Liste aller Imports, die auf zu loeschende Verzeichnisse verweisen
- Verification: Grep-Output dokumentiert
- Dependencies: none

#### MT-3: Legacy-API-Routes loeschen
- Goal: Alle toten API-Routes entfernen
- Files: Komplette Verzeichnisse `src/app/api/tenant/runs/`, `src/app/api/admin/runs/`, `src/app/api/admin/catalog/`, `src/app/api/tenant/mirror/`
- Expected behavior: 26 Route-Dateien geloescht
- Verification: Verzeichnisse existieren nicht mehr
- Dependencies: MT-2

#### MT-4: Legacy-Pages und Client-Components loeschen
- Goal: Alle toten Pages und deren Client-Components entfernen
- Files: Komplette Verzeichnisse `src/app/admin/runs/`, `src/app/admin/catalog/`, `src/app/mirror/profile/`, `src/app/mirror/nominations/`, `src/app/mirror/policy/`, `src/app/runs/`
- Expected behavior: ~15 Dateien geloescht
- Verification: Verzeichnisse existieren nicht mehr
- Dependencies: MT-2

#### MT-5: Verwaiste Components pruefen und bereinigen
- Goal: Components die nur von Legacy-Routes importiert wurden identifizieren und ggf. entfernen
- Files: Pruefen: `src/components/status-badge.tsx`, `src/components/progress-indicator.tsx`, andere
- Expected behavior: Nur tatsaechlich verwaiste Components entfernt, gemeinsam genutzte bleiben
- Verification: `npm run build` erfolgreich
- Dependencies: MT-3, MT-4

#### MT-6: Legacy-Migrations loeschen
- Goal: 16 Blueprint-Migrations (003-020) aus sql/migrations/ entfernen
- Files: `sql/migrations/003_*.sql` bis `sql/migrations/020_*.sql`
- Expected behavior: sql/migrations/ enthaelt nur 021+
- Verification: `ls sql/migrations/ | head` zeigt nur 021+
- Dependencies: none

#### MT-7: Sidebar/Navigation bereinigen + admin/tenants Route fixen
- Goal: Legacy-Links aus Sidebars entfernen, admin/tenants Route von Run-Counting auf capture_session-Counting umstellen
- Files: `src/components/admin-sidebar.tsx`, `src/components/dashboard-sidebar.tsx`, `src/app/api/admin/tenants/route.ts`
- Expected behavior: Keine Links zu /runs/, /admin/runs/, /admin/catalog/, /mirror/. Tenants-API zaehlt capture_sessions statt runs.
- Verification: Build erfolgreich, keine toten Links in Navigation
- Dependencies: MT-3, MT-4

#### MT-8: Build + Test Verifikation
- Goal: Finaler Build- und Test-Lauf nach allen Loeschungen
- Files: keine neuen Aenderungen
- Expected behavior: `npm run build` und `npm run test` beide erfolgreich
- Verification: exit 0 auf beiden Commands
- Dependencies: MT-5, MT-6, MT-7
