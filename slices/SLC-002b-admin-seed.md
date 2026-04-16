# SLC-002b — strategaize_admin + Demo-Tenant Seed

- Feature: FEAT-001
- Status: planned
- Priority: High
- Created: 2026-04-15
- Updated: 2026-04-16 (Strategieentscheidung auf Weg 2 gesetzt, siehe DEC-011)
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Einen strategaize_admin-User anlegen, damit Admin-Flaechen ueberhaupt benutzbar sind, und einen Demo-Tenant + Demo-tenant_admin-User, damit ein echter Login-Flow-Smoke-Test durchgefuehrt werden kann. Ohne diesen Seed laeuft die live-DB leer und jede UI-Verifikation bleibt theoretisch.

## In Scope (aktualisiert — Weg 2 gewaehlt, DEC-011)
- SQL-Migration `sql/migrations/027_seed_demo_tenant.sql` — NUR die Demo-Tenant-Row (public-Schema, fixe UUID `00000000-0000-0000-0000-0000000000de`, `ON CONFLICT (id) DO NOTHING`)
- Seed-Script `scripts/seed-admin.mjs` — One-Shot-Node-Script via Supabase Admin API:
  - strategaize_admin: `supabase.auth.admin.createUser` mit `email_confirm: true` + `user_metadata.role = 'strategaize_admin'`. `handle_new_user`-Trigger legt `profiles`-Row mit `tenant_id = NULL` an. Script patcht anschliessend Rolle/Tenant als Reconcile-Schritt.
  - Demo-tenant_admin: dito mit `user_metadata = { role: 'tenant_admin', tenant_id: '<demo-uuid>' }`.
- Idempotent: `listUsers` + skip-if-exists. Profile-Row wird bei jedem Lauf auf Soll-Stand gepatcht.
- Fail-Fast-ENV-Checks im Script (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_TENANT_ADMIN_EMAIL`, `SEED_DEMO_TENANT_ADMIN_PASSWORD`, `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- `package.json`-Script `npm run seed:admin`.
- `.env.deploy.example` + `.env.local.example` um SEED_* erweitert.
- `docs/RUNBOOK.md` (neu) — Seed-Befehl, Credential-Rotation, Disaster-Recovery.

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
- Seed-Passwoerter in ENV: Coolify-Secrets muessen gesetzt sein, sonst bricht `scripts/seed-admin.mjs` mit Exit-Code 1 ab (Fail-Fast).
- `supabase.auth.admin.listUsers` ist paginiert. Fuer V1 (< 10 User) reicht die erste Seite mit `perPage: 100`. Wenn der User-Bestand waechst (V2+), muss das Script paginieren.
- Der `handle_new_user`-Trigger setzt Rolle + tenant_id aus `raw_user_meta_data`. Sollte sich das Trigger-Verhalten in einer kuenftigen Schema-Version aendern, rettet der explizite Profile-UPDATE im Script den Zustand.
- Demo-Tenant-UUID ist hardcoded (`00000000-0000-0000-0000-0000000000de`). Bewusste Konvention — kein Konflikt zu echten Tenants (gen_random_uuid liefert niemals Zero-Prefix).

## Strategieentscheidung in diesem Slice (getroffen 2026-04-16 — DEC-011)

**Gewaehlt: Weg 2 — Supabase-Admin-API via One-Shot-Seed-Script.** SQL-Migration wird reduziert auf die Tenant-Row (public-Schema = "unser Land").

Gruende gegen direkten INSERT in `auth.users`:
- Supabase-internes Schema (Felder `aud`, `instance_id`, `confirmation_token`, zugehoerige `auth.identities`-Row) bricht bei jedem Supabase-Upgrade.
- Bcrypt-Round-Count-Mismatch zwischen pgcrypto `gen_salt('bf')` und Supabase-Auth ist eine Klassische Support-Falle.
- Postgres-Custom-Config `-c onboarding.seed_...` fuer ENV-Pass ist bei Coolify-managed Supabase aufwendig und leakt Credentials in `pg_stat_activity`.

Gruende fuer Admin-API:
- `supabase.auth.admin.createUser` ist der stabile Supabase-Vertrag (handled bcrypt, `auth.identities`, `email_confirm`, Metadaten).
- ENV-Handling sauberer: normale Next.js-ENV + Service-Role-Key.
- Idempotenz einfach: `listUsers` + Lookup, dann Create-if-missing.
- Passt zum manuellen Coolify-Deploy-Rhythmus: `docker exec <app> npm run seed:admin` einmalig nach erstem Deploy.

Akzeptierter Tradeoff: Seed-User sind nicht als versionierte Migration getrackt, sondern operativer Zustand via RUNBOOK. Das ist konsistent mit der Semantik (Seed-User = Betriebskonfiguration, nicht Schema-Evolution).

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
