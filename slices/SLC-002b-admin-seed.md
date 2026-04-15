# SLC-002b — strategaize_admin + Demo-Tenant Seed

- Feature: FEAT-001
- Status: planned
- Priority: High
- Created: 2026-04-15
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Einen strategaize_admin-User anlegen, damit Admin-Flaechen ueberhaupt benutzbar sind, und einen Demo-Tenant + Demo-tenant_admin-User, damit ein echter Login-Flow-Smoke-Test durchgefuehrt werden kann. Ohne diesen Seed laeuft die live-DB leer und jede UI-Verifikation bleibt theoretisch.

## In Scope
- Seed-Migration `027_seed_admin_and_demo_tenant.sql`
- strategaize_admin:
  - 1 Zeile in `auth.users` mit fester UUID (env-ueberschreibbar), E-Mail via ENV
  - `handle_new_user`-Trigger legt automatisch `profiles`-Eintrag mit `role = 'strategaize_admin'` und `tenant_id = NULL` an
- Demo-Tenant:
  - 1 Zeile in `tenants` (slug `demo`, name "Demo Onboarding GmbH")
  - 1 Zeile in `auth.users` fuer tenant_admin, automatisch verbunden mit Tenant via `raw_user_meta_data.tenant_id`
  - `handle_new_user` legt `profiles`-Eintrag mit `role = 'tenant_admin'` und `tenant_id = <demo>` an
- Idempotent (`ON CONFLICT DO NOTHING`) — Re-Deploy bricht nicht
- Passwoerter als ENV-Variablen `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_TENANT_ADMIN_EMAIL`, `SEED_DEMO_TENANT_ADMIN_PASSWORD`
- Dokumentation in `docs/RUNBOOK.md` oder README, wie Credentials gesetzt/rotiert werden

## Out of Scope
- UI zum Seed/Invite (kommt spaeter)
- Mehrere Demo-Tenants
- E-Mail-Invite-Flow (kommt mit SLC-005/006 Login-UX)
- Passwort-Rotation automatisiert
- Echte Kunden-Tenants

## Acceptance
- Nach Deploy: Login mit `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` auf `/login` funktioniert
- Login mit Demo-tenant_admin funktioniert
- `SELECT * FROM profiles` zeigt genau 2 Zeilen mit korrekten Rollen und tenant_ids
- Re-Deploy (zweiter Lauf) wirft keinen Fehler, aendert keine Rows
- Migration 027 in `/docs/MIGRATIONS.md` dokumentiert

## Dependencies
- SLC-002 (Rolle heisst `tenant_admin`)
- SLC-001 (Schema + Trigger handle_new_user)

## Risks
- Seed-Passwoerter in ENV: Coolify-Secrets muessen gesetzt sein, sonst scheitert Migration oder setzt leere Passwoerter — Migration muss explizit abbrechen wenn ENV fehlt.
- Auth.users ist sensitives Supabase-Schema — direkter INSERT umgeht normalerweise Supabase-Auth-API. Das funktioniert, aber Password-Hash muss korrekt mit bcrypt erzeugt werden. Alternativ: Supabase-Admin-REST-API via Service-Role aus Post-Deploy-Skript statt SQL-Migration.
- Wenn der Trigger `handle_new_user` nicht greift (weil wir direkt in auth.users INSERTen), muss der Seed explizit auch in `profiles` schreiben.

## Strategieentscheidung in diesem Slice
Zwei Wege pruefen und fuer einen entscheiden:
1. **SQL-Migration mit direktem INSERT in auth.users** — funktioniert, braucht korrektes bcrypt-Hashing + manuelles profile-INSERT falls Trigger nicht feuert.
2. **Post-Deploy-Script via Supabase-Admin-API** — sauberer aber mehr Infrastruktur (Node-Script im Dockerfile oder Coolify-Hook).

Standard ist Weg 1, solange bcrypt in pgcrypto verfuegbar ist (Supabase-Default).

## Micro-Tasks

### MT-1: ENV-Variablen-Schema + Fail-Safe
- Goal: Migration bricht ab wenn Seed-ENV fehlt.
- Files: `sql/migrations/027_seed_admin_and_demo_tenant.sql`
- Expected behavior: Migration-Block pruft `current_setting('onboarding.seed_admin_email', true)` und `RAISE EXCEPTION` wenn leer.
- Verification: Migration ohne ENV schlaegt kontrolliert fehl.
- Dependencies: none

### MT-2: strategaize_admin-Seed
- Goal: Admin-User in auth.users + profiles.
- Files: `sql/migrations/027_seed_admin_and_demo_tenant.sql`
- Expected behavior: INSERT in auth.users mit bcrypt-Hash, danach (falls Trigger nicht greift) INSERT in profiles. `ON CONFLICT (id) DO NOTHING`.
- Verification: `SELECT role FROM profiles WHERE email = '<admin>'` liefert `strategaize_admin`.
- Dependencies: MT-1, SLC-001 handle_new_user-Trigger

### MT-3: Demo-Tenant + Demo-tenant_admin-Seed
- Goal: 1 Tenant + 1 User mit Rolle tenant_admin.
- Files: `sql/migrations/027_seed_admin_and_demo_tenant.sql`
- Expected behavior: INSERT in tenants (`slug='demo'`). INSERT in auth.users mit `raw_user_meta_data.tenant_id`. Profile wird via Trigger oder expliziter INSERT mit `role='tenant_admin'` und `tenant_id=<demo>` angelegt.
- Verification: `SELECT p.role, t.slug FROM profiles p JOIN tenants t ON p.tenant_id=t.id` zeigt `tenant_admin | demo`.
- Dependencies: MT-2, SLC-002 (Rolle heisst tenant_admin)

### MT-4: Coolify-Secrets setzen + Deploy
- Goal: Seed-Credentials auf Hetzner definieren.
- Files: keine Code-Files — Coolify-UI-Schritt
- Expected behavior: ENV-Variablen fuer den Postgres-Container gesetzt (via Postgres-custom-options `-c onboarding.seed_admin_email=...`). Migration wird im naechsten Restart gelaufen.
- Verification: `docker exec supabase-db-... psql -U postgres -d postgres -c "SELECT email FROM auth.users"` zeigt 2 User.
- Dependencies: MT-3

### MT-5: Manueller Login-Smoke-Test
- Goal: Real-World-Login auf beiden Usern verifizieren.
- Files: `reports/RPT-SLC-002b-smoketest.md`
- Expected behavior: Login mit beiden Credentials gelingt, Redirect fuehrt zu Admin- resp. Tenant-Cockpit.
- Verification: Screenshot / Log-Eintrag im Report.
- Dependencies: MT-4

### MT-6: Dokumentation + MIGRATIONS.md-Eintrag
- Goal: Handover-Doku.
- Files: `docs/MIGRATIONS.md`, `README.md` (Abschnitt "Seeded Users")
- Expected behavior: MIG-003 (oder naechste Nummer) dokumentiert, README erklaert wie Credentials gerotiert werden.
- Verification: Format nach `.claude/rules/project-records-format.md`.
- Dependencies: MT-5

## Verification Summary
- Migration 027 auf Hetzner ausgefuehrt
- 2 User in auth.users, 2 korrekt verbundene profiles
- Login beider User manuell verifiziert
- Re-Deploy idempotent
- MIGRATIONS.md + README aktualisiert
