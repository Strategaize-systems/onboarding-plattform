# Releases

### REL-001 — SLC-001 Initial Deploy (V1-preview)
- Date: 2026-04-15
- Scope: Baseline-Datenmodell (tenants, profiles) + Core-Capture-Schema (template, capture_session, block_checkpoint, knowledge_unit, validation_layer) + RLS-Policies + Auth-Helper-Funktionen + handle_new_user-Trigger. Next.js-App-Container + 9 Supabase-Container + Whisper-Container auf Hetzner CPX62 (159.69.207.29). Domain: https://onboarding.strategaizetransition.com mit Let's-Encrypt-Cert.
- Summary: Erste produktive Instanz der Onboarding-Plattform. SLC-001 MT-1..MT-4 waren 2026-04-14 im Code fertig, MT-6 (Hetzner-Deploy) ist heute nach Aufraeumen der Hostname-Kollision und SSH-Zugang durch.
- Risks: Test-Infrastruktur fehlt noch (ISSUE-002), d.h. RLS-Integrationstest (MT-5) konnte nicht automatisiert laufen. Login-Flow + Admin-User-Seeding noch manuell auszuprobieren. Keine Bestandskunden, also niedriger operationeller Risikofaktor.
- Rollback Notes: `ssh root@159.69.207.29 'docker compose -p bwkg80w04wgccos48gcws8cs down -v'` entfernt alle 10 Container + Volumes. Coolify-Resource + DNS bleiben fuer Redeploy stehen. DB-Volume `bwkg80w04wgccos48gcws8cs_db-data` enthaelt bisher keine Echt-Daten, Verlust akzeptabel.
