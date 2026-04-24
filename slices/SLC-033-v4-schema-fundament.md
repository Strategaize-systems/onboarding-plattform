# SLC-033 — V4 Schema-Fundament

## Goal
Alle V4-Schema-Grundlagen in einem Schema-only-Slice: employee-Rolle, neue Tabellen (employee_invitation, bridge_run, bridge_proposal, handbook_snapshot), template-Feld-Erweiterungen, capture_mode- und knowledge_unit.source-CHECK-Erweiterungen, handbook Storage-Bucket und die kritische RLS-Perimeter-Migration fuer `employee`. Keine UI, kein Worker-Code, keine RPCs mit Business-Logik. Pflicht-Gate: RLS-Test-Matrix-Skelett laeuft im Test-Runner und faellt auf fehlende Policies auf.

## Feature
FEAT-022 (primaer), FEAT-023 + FEAT-024 + FEAT-025 + FEAT-026 (Schema-Vorbereitung)

## In Scope
- Migration 065 `065_employee_role.sql` — ALTER profiles.role CHECK additiv um `'employee'` erweitert. `sql/schema.sql` Init-Script Parity.
- Migration 066 `066_employee_invitation.sql` — Tabelle `employee_invitation` (12 Spalten) + RLS (strategaize_admin_full + tenant_admin_rw_own) + Indexes + GRANTs + updated_at-Trigger nicht noetig (Tabelle ist append-only).
- Migration 067 `067_capture_mode_v4.sql` — ALTER capture_session.capture_mode CHECK additiv um `'employee_questionnaire'` und `'walkthrough_stub'`. ALTER knowledge_unit.source CHECK additiv um `'employee_questionnaire'`.
- Migration 068 `068_bridge_tables.sql` — Tabellen `bridge_run` (14 Spalten) und `bridge_proposal` (15 Spalten) + RLS + Indexes + GRANTs + updated_at-Trigger + Trigger-Funktion `bridge_run_set_stale` (AFTER INSERT auf block_checkpoint setzt juengsten completed bridge_run derselben capture_session_id auf stale).
- Migration 069 `069_template_v4_fields.sql` — ALTER template ADD `employee_capture_schema` JSONB + `handbook_schema` JSONB. UPDATE des bestehenden exit_readiness-Templates mit initialem `employee_capture_schema` (3-5 subtopic_bridges fuer Bloecke A-I + free_form_slot mit max_proposals=3) und `handbook_schema` (8-10 Sections inkl. `operatives_tagesgeschaeft` fuer employee-KUs + cross_links auf subtopic-Ebene).
- Migration 070 `070_handbook_snapshot.sql` — Tabelle `handbook_snapshot` (14 Spalten) + RLS + Indexes + GRANTs + updated_at-Trigger.
- Migration 071 `071_handbook_storage_bucket.sql` — Storage-Bucket `handbook` (private, 50 MB Limit, MIME application/zip) + 3 Storage-Policies (insert nur service_role, select tenant_admin via foldername + strategaize_admin Cross-Tenant, delete nur strategaize_admin).
- Migration 075 `075_rls_employee_perimeter.sql` — RLS-Policy-Familie fuer `employee`-Rolle auf allen relevanten Tabellen (capture_session, block_checkpoint, knowledge_unit, validation_layer) mit explizit: employee sieht ausschliesslich Rows, wo `owner_user_id = auth.uid()` (capture_session) bzw. via JOIN auf eigene capture_sessions. KEINE SELECT-Policy auf block_diagnosis, sop, handbook_snapshot, bridge_run, bridge_proposal, employee_invitation — implizit kein Zugriff.
- RLS-Test-Matrix-Skelett: `src/__tests__/rls/v4-perimeter-matrix.test.ts` mit 4×8 Test-Skelett (4 Rollen × 8 Tabellen). Tests beanspruchen 32 erwartete Permission-Errors fuer employee auf Nicht-Eigen-Daten und Failure-Tests fuer Cross-Tenant. V4-Test-Fixtures: 2 Tenants × je 1 strategaize_admin / tenant_admin / tenant_member / employee.
- `docs/ARCHITECTURE.md` — kein Neuschreiben, aber V4-Section-Zeile "V4 Schema landed" + Migrations-Inventar aktualisiert.
- `docs/MIGRATIONS.md` — MIG-023 Status von `planned` auf `applied` setzen (nach Hetzner-Anwendung via `sql-migration-hetzner.md`-Pattern).
- `docs/STATE.md` Update auf "V4 SLC-033 done".

## Out of Scope
- Migrationen 072-074 (RPCs mit Business-Logik) — Teil von SLC-034 / SLC-035 / SLC-039.
- UI-Arbeit jeder Art.
- Worker-Job-Types — Teil von SLC-035 und SLC-039.
- `rpc_accept_employee_invitation` (braucht DEC-011-Pattern mit Auth-Admin-API) — Teil von SLC-034.
- Bridge-Engine-Logik, Handbuch-Renderer, Template-Updates fuer ImmoCheckheft o.a.

## Acceptance Criteria
- AC-1: Alle 8 Migrationen (065-071, 075) laufen idempotent auf frischer DB via `psql -U postgres` durch. Zweite Ausfuehrung produziert NO-OP ohne Fehler.
- AC-2: `\d employee_invitation`, `\d bridge_run`, `\d bridge_proposal`, `\d handbook_snapshot` zeigen alle in ARCHITECTURE.md spezifizierten Spalten, Typen, NOT-NULL und CHECK-Constraints.
- AC-3: `\d+ storage.buckets` listet `handbook` mit `public=false`, `file_size_limit=52428800`, `allowed_mime_types={application/zip}`.
- AC-4: Trigger `bridge_run_set_stale` feuert nachweislich: Manueller Test (`INSERT bridge_run (status='completed')` + `INSERT block_checkpoint` derselben capture_session_id) -> bridge_run.status=`stale`.
- AC-5: RLS-Test-Matrix-Skelett `npm run test -- v4-perimeter-matrix` laeuft, zeigt mindestens 32 Pflicht-Failure-Cases (employee auf 8 fremden Bereichen). Initial: mindestens eine Kategorie PASS (z.B. "employee SELECT capture_session fremder Tenant → 0 rows"). Volle Matrix wird in SLC-037 abgeschlossen, aber Skelett existiert mit allen 32 Faellen im Code, markiert `todo` oder `failing` wo noch nicht implementiert.
- AC-6: `sql/schema.sql` Init-Script reflektiert die neuen Strukturen 1:1 (DEC-002 Portabilitaets-Mandat).
- AC-7: Migration 075 enthaelt als Migration-Kommentar eine Verifikations-SQL-Abfrage, die ein Nicht-employee-SELECT simuliert und die erwartete Blockade dokumentiert.

## Dependencies
- Vorbedingung: V3 released (REL-005), Onboarding-DB auf Stand nach Migration 064.
- Folge-Voraussetzung fuer: SLC-034, SLC-035, SLC-037, SLC-039.

## Worktree
Mandatory (SaaS, Schema-Aenderungen auf Production-Datenmodell).

## Migrations-Zuordnung
065 / 066 / 067 / 068 / 069 / 070 / 071 / 075 (aus MIG-023).

## Pflicht-QA-Vorgaben
- `/qa` nach diesem Slice MUSS folgende Punkte abdecken:
  - RLS-Test-Matrix-Skelett laeuft und deckt 32 Faelle ab (auch noch nicht vollstaendig gruen — Status-Bericht ausreichend).
  - Idempotenz aller 8 Migrationen (zweite Anwendung NO-OP).
  - `sql/schema.sql` Parity-Check (DEC-002).
  - `npm run test` insgesamt gruen.
  - Manuelle Verifikation `bridge_run_set_stale` Trigger-Verhalten (2 Test-INSERTs).
- SQL-Migration auf Hetzner nach Pattern `.claude/rules/sql-migration-hetzner.md` (base64 + `psql -U postgres`). KEIN `supabase_admin`.
- IMP-112: Vor Write von STATE.md / slices/INDEX.md / planning/backlog.json je Re-Read.

## Risks
- R16 (Mitarbeiter-Sicht-Perimeter): Migration 075 muss explizit und defensiv sein. Eine vergessene Default-Policy ist ein Datenleck. Mitigation: Migration-Kommentar + Test-Matrix-Skelett.
- MIG-023-Risk (Auth-Admin-Pattern in 072) wird bewusst AUS DIESEM Slice herausgehalten und in SLC-034 final addressiert.

### Micro-Tasks

#### MT-1: Migration 065 employee_role
- Goal: profiles.role CHECK additiv um 'employee' erweitert.
- Files: `sql/migrations/065_employee_role.sql`, `sql/schema.sql` (Parity-Update)
- Expected behavior: DROP CONSTRAINT profiles_role_check + ADD CONSTRAINT profiles_role_check CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee')). Idempotent via `IF EXISTS` + Re-Create.
- Verification: `psql -c "\d profiles"` zeigt CHECK mit 4 Werten. Re-Run identisch. `auth.user_role()` unveraendert liefert Wert.
- Dependencies: none
- TDD-Note: Keine Unit-Tests noetig (reine CHECK-Migration). Smoke-Test manuell.

#### MT-2: Migration 066 employee_invitation Tabelle + RLS
- Goal: Tabelle `employee_invitation` + 2 RLS-Policies + Indexes + GRANTs.
- Files: `sql/migrations/066_employee_invitation.sql`, `sql/schema.sql` (Parity)
- Expected behavior: CREATE TABLE mit den 12 Spalten wie in ARCHITECTURE.md. RLS ENABLE + POLICY `employee_invitation_admin_full` (strategaize_admin) + POLICY `employee_invitation_tenant_admin_rw` (tenant_admin + eigener tenant). Indexes `idx_employee_invitation_pending_email` (UNIQUE partial) + `idx_employee_invitation_tenant`. GRANT SELECT, INSERT, UPDATE ON TABLE an authenticated + service_role.
- Verification: `\d employee_invitation` zeigt alle Spalten + CHECK. `SELECT * FROM pg_policies WHERE tablename = 'employee_invitation'` zeigt 2 Policies. INSERT-Test von Dummy-Invitation durch tenant_admin laeuft; Cross-Tenant-INSERT blockiert.
- Dependencies: MT-1
- TDD-Note: In `src/__tests__/rls/v4-perimeter-matrix.test.ts` Skelett-Tests hinzufuegen (mind. 4 Faelle fuer diese Tabelle).

#### MT-3: Migration 067 capture_mode + knowledge_unit.source CHECK
- Goal: capture_session.capture_mode + knowledge_unit.source CHECKs additiv erweitert.
- Files: `sql/migrations/067_capture_mode_v4.sql`, `sql/schema.sql`
- Expected behavior: DROP + ADD beide CHECK-Constraints mit den neuen Werten ('employee_questionnaire', 'walkthrough_stub' fuer capture_mode; 'employee_questionnaire' fuer source). Bestehende Daten unveraendert.
- Verification: `\d capture_session` und `\d knowledge_unit` zeigen die neuen CHECK-Werte. Ein INSERT mit capture_mode='employee_questionnaire' ist moeglich.
- Dependencies: MT-1
- TDD-Note: Keine Unit-Tests noetig.

#### MT-4: Migration 068 bridge_run + bridge_proposal + stale-Trigger
- Goal: 2 Tabellen + RLS + Indexes + GRANTs + updated_at-Trigger + `bridge_run_set_stale` Trigger-Funktion.
- Files: `sql/migrations/068_bridge_tables.sql`, `sql/schema.sql`
- Expected behavior: CREATE TABLE bridge_run und bridge_proposal wie spezifiziert. RLS ENABLE + je 2 Policies (admin_full + tenant_admin_rw_own). Indexes auf bridge_run_id + tenant_status. updated_at-Trigger auf bridge_proposal. Trigger-Funktion bridge_run_set_stale als AFTER INSERT auf block_checkpoint: wenn checkpoint_type='questionnaire_submit', UPDATE bridge_run SET status='stale' WHERE capture_session_id = NEW.capture_session_id AND status = 'completed' AND id = (SELECT id FROM bridge_run WHERE capture_session_id = NEW.capture_session_id AND status = 'completed' ORDER BY created_at DESC LIMIT 1).
- Verification: `\d bridge_run` + `\d bridge_proposal` + Trigger-Funktion existiert (`\df bridge_run_set_stale`). Manueller Test: INSERT bridge_run (completed) + INSERT block_checkpoint → bridge_run.status='stale'.
- Dependencies: MT-1
- TDD-Note: Test in `src/__tests__/migrations/bridge-stale-trigger.test.ts` (kleiner Integration-Test gegen Coolify-DB): Fixture-bridge_run + Fixture-block_checkpoint → Status-Check.

#### MT-5: Migration 069 template-Felder + exit_readiness-Content-Update
- Goal: 2 neue JSONB-Spalten auf template + UPDATE des exit_readiness Templates mit Initial-Content.
- Files: `sql/migrations/069_template_v4_fields.sql`, `sql/schema.sql`
- Expected behavior: ALTER TABLE template ADD COLUMN employee_capture_schema JSONB + handbook_schema JSONB (beide DEFAULT NULL). UPDATE template SET employee_capture_schema='{...3-5 subtopic_bridges, free_form_slot max_proposals=3...}'::jsonb, handbook_schema='{...8-10 sections...}'::jsonb WHERE slug='exit_readiness'. Content reflektiert Bloecke A-I und diagnosis_schema aus bestehendem Template.
- Verification: `SELECT slug, jsonb_array_length(employee_capture_schema->'subtopic_bridges') FROM template WHERE slug='exit_readiness'` liefert 3-5. `handbook_schema->'sections'` enthaelt mind. `operatives_tagesgeschaeft` plus 7+ weitere.
- Dependencies: none (template-Tabelle existiert)
- TDD-Note: Unit-Test `src/__tests__/templates/exit-readiness-v4-schemas.test.ts`: JSONB-Struktur-Validierung (`subtopic_bridges` ist Array, `free_form_slot.max_proposals === 3`, `sections` enthaelt `operatives_tagesgeschaeft`).

#### MT-6: Migration 070 handbook_snapshot Tabelle
- Goal: handbook_snapshot-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger.
- Files: `sql/migrations/070_handbook_snapshot.sql`, `sql/schema.sql`
- Expected behavior: CREATE TABLE mit 14 Spalten. RLS + 2 Policies (admin_full + tenant_admin_rw_own). Indexes session + tenant. updated_at-Trigger.
- Verification: `\d handbook_snapshot` komplett. `SELECT * FROM pg_policies WHERE tablename='handbook_snapshot'` zeigt 2 Policies.
- Dependencies: MT-1
- TDD-Note: RLS-Matrix-Skelett um 4 Faelle erweitern.

#### MT-7: Migration 071 handbook Storage-Bucket
- Goal: Bucket + 3 Policies.
- Files: `sql/migrations/071_handbook_storage_bucket.sql`, `sql/schema.sql`
- Expected behavior: INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) mit `ON CONFLICT DO NOTHING`. 3 Storage-Policies: `handbook_insert_service_role_only`, `handbook_select_tenant_admin_or_strategaize`, `handbook_delete_strategaize_only`.
- Verification: `SELECT * FROM storage.buckets WHERE id='handbook'` liefert 1 Row. `SELECT * FROM storage.policies WHERE bucket_id='handbook'` liefert 3.
- Dependencies: none
- TDD-Note: Keine Unit-Tests; Storage-Policies werden in SLC-039 Worker-seitig verifiziert.

#### MT-8: Migration 075 RLS-Perimeter fuer employee
- Goal: Explizite RLS-Policies auf capture_session / block_checkpoint / knowledge_unit / validation_layer, die `employee` einschraenken. Keine SELECT-Policies fuer employee auf block_diagnosis / sop / handbook_snapshot / bridge_run / bridge_proposal / employee_invitation.
- Files: `sql/migrations/075_rls_employee_perimeter.sql`, `sql/schema.sql`
- Expected behavior: Pro Tabelle eine CREATE POLICY `<tabelle>_employee_own` FOR SELECT USING (auth.user_role()='employee' AND (direkter owner_check ODER JOIN auf eigene capture_session)). Explicit DROP-IF-EXISTS + CREATE POLICY fuer Idempotenz. Migration-Kommentar dokumentiert erwartete Blockade-Beispiele (z.B. "employee SELECT block_diagnosis → keine Policy → 0 rows").
- Verification: Nach Anwendung: `SELECT * FROM pg_policies WHERE tablename IN (...) AND policyname LIKE '%_employee_%'` zeigt mind. 4 Policies. Manuelle Verifikation ueber Test-Fixtures in MT-9.
- Dependencies: MT-2, MT-4, MT-6
- TDD-Note: Dies ist der kritische Schritt. Tests in MT-9.

#### MT-9: RLS-Test-Matrix-Skelett + V4-Test-Fixtures
- Goal: `src/__tests__/rls/v4-perimeter-matrix.test.ts` mit 4×8 Matrix (32 Faelle) plus Fixtures.
- Files: `src/__tests__/rls/v4-perimeter-matrix.test.ts`, `src/__tests__/rls/v4-fixtures.ts`
- Expected behavior: Fixtures erzeugen 2 Tenants × je 4 User-Rollen (strategaize_admin/tenant_admin/tenant_member/employee) plus Dummy-Rows pro Tabelle. Matrix durchlaeuft 4 Rollen × 8 Tabellen (employee_invitation, bridge_run, bridge_proposal, handbook_snapshot, capture_session, knowledge_unit, block_diagnosis, sop). Fuer employee: 32 Test-Faelle mit erwartetem Verhalten (0 rows oder Permission-Error) pro Nicht-Eigen-Szenario. Tests, die noch nicht vollstaendig implementiert werden, werden mit `.todo()` markiert (fuer Vervollstaendigung in SLC-037).
- Verification: `npm run test -- v4-perimeter-matrix` laeuft. Ausgabe zeigt mind. 32 Pflicht-Faelle fuer employee. Mind. 8 Faelle sind direkt gruen (z.B. employee SELECT auf employee_invitation → 0 rows).
- Dependencies: MT-8
- TDD-Note: Skelett-Tests mit `test.todo()` fuer spaetere Vervollstaendigung sind erlaubt, solange die 32 Faelle namentlich sichtbar sind.

#### MT-10: sql/schema.sql Parity + docs/MIGRATIONS.md Status-Update + STATE.md + INDEX.md
- Goal: Init-Script und Record-Updates.
- Files: `sql/schema.sql`, `docs/MIGRATIONS.md`, `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`
- Expected behavior: Parity-Check: schema.sql reflektiert alle 8 Migrationen. MIG-023 Status auf `applied` (oder `partially applied` mit Vermerk, dass 072-074 noch folgen). SLC-033 Eintrag in INDEX.md auf Status `done`. STATE.md: Current Focus "V4 Implementation — SLC-033 done, naechste SLC-034". backlog.json BL-041 Status `in_progress`.
- Verification: Re-Read vor Write (IMP-112). Record-Format gemaess `.claude/rules/project-records-format.md`.
- Dependencies: MT-1..MT-9
- TDD-Note: Doku-Update, keine Tests.

## Aufwand-Schaetzung
Netto ~4-6 Stunden Backend + DB + Tests. Risiko-Puffer fuer Trigger-Debugging und RLS-Matrix-Fixture-Aufbau: +2 Stunden. Gesamt: ~6-8 Stunden.
