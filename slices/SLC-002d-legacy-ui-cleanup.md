# SLC-002d — Blueprint-Legacy-UI-Cleanup

- Feature: FEAT-001
- Status: in_progress
- Priority: Medium
- Created: 2026-04-16
- Updated: 2026-04-16 (nach MT-1 Audit — Scope erweitert auf owner_profiles-Lookups + Migrations-Cleanup)
- Delivery Mode: SaaS (TDD optional — reine Deletions, keine neuen Behaviours)
- Worktree: nein (direkt auf main)

## Goal
Alle Blueprint-geerbten UI-, API- und Daten-Pfade entfernen, die im Onboarding-Plattform-V1-Scope nicht mehr benoetigt werden, beim realen Smoketest stoeren (ISSUE-009) oder tote Pfade produzieren (ISSUE-008). Damit ist der Code-Pfad ab SLC-003 (Template/Questionnaire) frei von Blueprint-spezifischen Umwegen. Der Cleanup umfasst sowohl UI-Deletions als auch `owner_profiles`-Lookups in LLM- und Run-APIs (Silent Null-Reads) sowie die zugehoerige DB-Tabelle.

## Architektur-Entscheidungen (nach MT-1 Audit)

- **A1:** `owner_profiles`-Lookups in `llm.ts` + runs-APIs komplett entfernen. LLM verliert Personalisierungs-Context, Template-spezifische Owner-Erhebung kommt in V2+ zurueck.
- **B1:** `/mirror/profile`-Flow bleibt drin (OS-portierter Operational-Reality-Mirror, eigenstaendig).
- **C1:** `FeedbackPanel` wird mitgeloescht + Import/Render in `run-workspace-client.tsx` raus.
- **D:** Neue Migration `028_drop_owner_profiles.sql` mit `DROP TABLE IF EXISTS owner_profiles CASCADE`. Migrations 012 + 014 bleiben als Historie, bekommen Header-Kommentar `-- DEPRECATED by 028`.
- **Variante 1 bei `dashboard/page.tsx`:** Owner-Profile-Check + Redirect komplett entfernen (Dead Code). Mirror-Profile-Check bleibt.

## In Scope

### UI + API Deletes
- `src/app/profile/page.tsx`
- `src/app/profile/profile-form-client.tsx`
- `src/app/api/tenant/profile/route.ts`
- `src/components/profile/leadership-select.tsx`
- `src/components/profile/disc-select.tsx`
- `src/app/api/tenant/runs/[runId]/feedback/route.ts`
- `src/components/workspace/feedback-panel.tsx`
- Import + Render von `FeedbackPanel` in `src/app/runs/[id]/run-workspace-client.tsx` (Zeilen 54 + 1108)
- Sidebar-Link `/profile` in `src/components/dashboard-sidebar.tsx:93` (der `/mirror/profile`-Link bleibt)

### owner_profiles-Lookups entfernen
- `src/lib/llm.ts` (Profile-Context-Builder, Zeilen ~733–781, 822–859)
- `src/app/dashboard/page.tsx` (Zeilen ~61–71: DB-Select + Redirect-Logik)
- `src/app/api/tenant/runs/[runId]/evidence/route.ts` (Zeile ~259)
- `src/app/api/tenant/runs/[runId]/questions/[questionId]/chat/route.ts` (Zeile ~56)
- `src/app/api/tenant/runs/[runId]/questions/[questionId]/generate-answer/route.ts` (Zeile ~44)
- `src/app/api/tenant/runs/[runId]/freeform/chat/route.ts` (Zeile ~106)

### Migrations
- NEU: `sql/migrations/028_drop_owner_profiles.sql`
- UPDATE: Header-Kommentar in `012_owner_profiles.sql` + `014_owner_profiles_grant_authenticated.sql` (`-- DEPRECATED by 028`)

### Docs
- `docs/KNOWN_ISSUES.md`: ISSUE-008 + ISSUE-009 auf `Status: resolved`
- `docs/MIGRATIONS.md`: neuer MIG-007-Eintrag fuer owner_profiles-Drop
- Korrektur der Annahme "owner_profiles per MIG-003 entfernt" in KNOWN_ISSUES (stimmt nicht — MIG-003 ist block_checkpoints)

## Out of Scope
- `/mirror/profile` + `/api/tenant/mirror/profile` (eigenstaendiger Flow, bleibt)
- `src/app/api/tenant/transcribe/` (wird fuer V2+ Voice-Capture gebraucht)
- i18n-Keys — `messages/*.json` existiert im Onboarding-Repo nicht (kein i18n-System)
- Andere Blueprint-Legacy-Migrations (012 + 014 ausgenommen — die werden hier abgefangen)
- Dashboard-Neu-Design
- Owner-Profile-Wiedereinfuehrung (V2+ template-spezifisch)

## Acceptance
- `GET /profile` liefert HTTP 404
- `PUT /api/tenant/profile` liefert HTTP 404
- `PUT /api/tenant/runs/<id>/feedback` liefert HTTP 404
- `npm run build` laeuft ohne Fehler
- `npm run test` laeuft ohne Fehler
- Login beider Seed-Credentials → direkt auf `/dashboard` (ggf. weiter auf `/mirror/profile` falls Mirror fehlt, aber NICHT auf `/profile`)
- `owner_profiles`-Tabelle nach Migration 028 nicht mehr in DB
- ISSUE-008 + ISSUE-009 auf `resolved` in KNOWN_ISSUES.md
- MIG-007 in MIGRATIONS.md dokumentiert

## Dependencies
- SLC-002b (Seed-User vorhanden)

## Risks
- `owner_profiles`-Lookups in runs-APIs koennten implizite Fallback-Logik gehabt haben (z.B. Prompt-Personalisierung). Nach Entfernung: LLM antwortet generisch, nicht owner-spezifisch. Akzeptiert — kommt in V2+ template-basiert zurueck.
- `DROP TABLE CASCADE` in Migration 028 entfernt evtl. auch FKs / abhaengige Views, falls existieren. Muss vor Prod-Run auf einem Snapshot verifiziert werden, oder zumindest `\d owner_profiles` pre-flight ansehen.

## Micro-Tasks

### MT-1: Grep + Audit ✅ DONE
Vollstaendige Liste aller Referenzen gesammelt. Scope erweitert um Befunde 2, 3, 4, 6.

### MT-2a: UI-Deletes
- Goal: Blueprint-Profile-UI + API entfernen.
- Files: `src/app/profile/*`, `src/app/api/tenant/profile/route.ts`, `src/components/profile/*`
- Dependencies: MT-1

### MT-2b: FeedbackPanel-Deletes
- Goal: Feedback-Route + Component + Importer entfernen.
- Files: `src/app/api/tenant/runs/[runId]/feedback/route.ts`, `src/components/workspace/feedback-panel.tsx`, Edit in `src/app/runs/[id]/run-workspace-client.tsx`
- Dependencies: MT-2a

### MT-2c: owner_profiles-Lookups entfernen
- Goal: Alle `.from("owner_profiles")`-Selects + Profile-Prompt-Injection aus llm.ts entfernen.
- Files: `src/lib/llm.ts`, `src/app/dashboard/page.tsx`, 4× `src/app/api/tenant/runs/[runId]/...`
- Dependencies: MT-2b

### MT-2d: Sidebar-Link entfernen
- Goal: Blueprint-`/profile`-Link im Dashboard-Sidebar raus, Mirror-Link bleibt.
- Files: `src/components/dashboard-sidebar.tsx` (nur Zeile 93er Block)
- Dependencies: MT-2c

### MT-3a: Migration 028 anlegen
- Goal: `DROP TABLE IF EXISTS owner_profiles CASCADE`.
- Files: `sql/migrations/028_drop_owner_profiles.sql`
- Dependencies: MT-2d

### MT-3b: Legacy-Migrations als deprecated markieren
- Goal: Header-Kommentar in 012 + 014.
- Files: `sql/migrations/012_owner_profiles.sql`, `sql/migrations/014_owner_profiles_grant_authenticated.sql`
- Dependencies: MT-3a

### MT-4: Build + Test
- Goal: `npm run build` + `npm run test` gruen.
- Dependencies: MT-3b

### MT-5: Deploy + Migration auf Hetzner + Smoketest
- Goal: Redeploy via Coolify, Migration 028 auf Hetzner ausfuehren, Login beider Seed-User verifizieren.
- Dependencies: MT-4

### MT-6: Issues schliessen + Annahme korrigieren
- Goal: ISSUE-008 + ISSUE-009 resolved, KNOWN_ISSUES-Text korrigieren (MIG-003 ≠ DROP owner_profiles).
- Files: `docs/KNOWN_ISSUES.md`
- Dependencies: MT-5

### MT-7: Records-Update
- Goal: STATE, INDEX, MIGRATIONS (MIG-007), backlog, RPT-013 (Completion), RPT-014 (QA).
- Files: `docs/STATE.md`, `slices/INDEX.md`, `docs/MIGRATIONS.md`, `planning/backlog.json`, `reports/RPT-013.md`, `reports/RPT-014.md`
- Dependencies: MT-6

## Verification Summary
- Build gruen ohne broken Imports
- Tests gruen
- `owner_profiles` Tabelle post-Migration 028 nicht mehr vorhanden (`\d owner_profiles` = "Did not find any relation")
- Deploy auf Hetzner, Login beider Seed-User → `/dashboard` direkt (oder `/mirror/profile` falls Mirror-Row fehlt, aber NICHT `/profile`)
- KNOWN_ISSUES aktualisiert (ISSUE-008 + ISSUE-009 resolved)
- MIG-007 in MIGRATIONS.md
