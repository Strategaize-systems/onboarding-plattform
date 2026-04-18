# Releases

### REL-001 — SLC-001 Initial Deploy (V1-preview)
- Date: 2026-04-15
- Scope: Baseline-Datenmodell (tenants, profiles) + Core-Capture-Schema (template, capture_session, block_checkpoint, knowledge_unit, validation_layer) + RLS-Policies + Auth-Helper-Funktionen + handle_new_user-Trigger. Next.js-App-Container + 9 Supabase-Container + Whisper-Container auf Hetzner CPX62 (159.69.207.29). Domain: https://onboarding.strategaizetransition.com mit Let's-Encrypt-Cert.
- Summary: Erste produktive Instanz der Onboarding-Plattform. SLC-001 MT-1..MT-4 waren 2026-04-14 im Code fertig, MT-6 (Hetzner-Deploy) ist heute nach Aufraeumen der Hostname-Kollision und SSH-Zugang durch.
- Risks: Test-Infrastruktur fehlt noch (ISSUE-002), d.h. RLS-Integrationstest (MT-5) konnte nicht automatisiert laufen. Login-Flow + Admin-User-Seeding noch manuell auszuprobieren. Keine Bestandskunden, also niedriger operationeller Risikofaktor.
- Rollback Notes: `ssh root@159.69.207.29 'docker compose -p bwkg80w04wgccos48gcws8cs down -v'` entfernt alle 10 Container + Volumes. Coolify-Resource + DNS bleiben fuer Redeploy stehen. DB-Volume `bwkg80w04wgccos48gcws8cs_db-data` enthaelt bisher keine Echt-Daten, Verlust akzeptabel.

### REL-002 — V1 Full Deploy
- Date: 2026-04-18
- Scope: Vollstaendiger V1-Stack mit allen 13 Slices (SLC-007 reverted). 5/6 Features live. 12 Container (App + Worker + 9 Supabase + Whisper). Alle 15 Migrations (021-037) deployed. Next.js 16.2.4 (Security-Patch). npm audit 0 Prod-Vulnerabilities.
- Summary: Erster vollstaendiger V1-Deploy. App-Container mit KI-Chat (Bedrock eu-central-1), Worker-Container mit Multi-Agent Analyst+Challenger Loop, Debrief-UI, Meeting-Snapshot, JSON-Export. AWS-Credentials-Blocker im App-Container gefixt (Go-Live RPT-031). Gesamt-QA PASS (RPT-029), Final-Check PASS (RPT-030).
- Risks: ~41 Blueprint-Legacy-Dateien (kein Runtime-Impact, ISSUE-011). Dashboard zeigt keine Capture-Sessions (ISSUE-012). Error-Logging-Tabelle fehlt in DB. Kein CSP-Header. Kein Backup-Schedule. Kein Impressum/Datenschutz. Alle akzeptiert fuer internen Launch.
- Rollback Notes: Coolify UI → vorheriges Deployment waehlen → Redeploy. DB-Stand unveraendert (keine neuen Migrations in diesem Deploy). Bei Bedarf: `docker compose down -v` — keine Echtdaten, Verlust akzeptabel.
