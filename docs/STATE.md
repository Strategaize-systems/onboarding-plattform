# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: implementing
- Current Focus: SLC-001 erfolgreich auf Hetzner deployed (2026-04-15). 7 Tabellen (tenants, profiles + 5 Capture-Tabellen), 16 RLS-Policies, 4 Helper-Funktionen produktiv. App rendert unter https://onboarding.strategaizetransition.com/login mit HTTP 200. Naechster Schritt: QA auf SLC-001, danach SLC-002.
- Current Phase: V1 Implementation (SLC-001 implementiert + deployed, QA offen)

## Immediate Next Steps
1. /qa auf SLC-001 (Schema-Integritaet, RLS-Verhalten, Queries aus template-/capture-session-/knowledge-unit-queries.ts)
2. SLC-002 starten (User-Management / RBAC-UI gemaess Slice-Plan)
3. Test-Infrastruktur einrichten (ISSUE-002): Vitest + Supabase-local oder docker-compose.test.yml — fuer zukuenftige Integrationstests
4. Login-Flow manuell testen: strategaize_admin-User seeden, Browser-Login, RLS-Policies im UI pruefen

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md):
- FEAT-001 Foundation Data Model & RBAC → SLC-001 (implementiert + deployed, QA offen), SLC-002 (planned)
- FEAT-002 Exit-Readiness Template → SLC-003 (planned)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (planned)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (planned)
- FEAT-005 Single-Pass AI Condensation → SLC-008 (planned)
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010 (planned)

## Blockers
- aktuell keine (SSH-Problem geloest 2026-04-15, Deploy durch, Business-DB aufgeraeumt)

## Known Issues (reference)
- ISSUE-002 Test-Infrastruktur fehlt — betrifft SLC-001 MT-5 (RLS-Integrationstest), ist aber nicht mehr Deploy-Blocker
- ISSUE-003 node_modules lokal nicht installiert — nur Dev-Convenience, Build auf Server laeuft

## Last Stable Version
- V1-preview @ commit 6601cbe — deployed 2026-04-15, DB-Baseline + Capture-Schema + App bereit unter https://onboarding.strategaizetransition.com

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
