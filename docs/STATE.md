# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: qa
- Current Focus: SLC-002 durch (RPT-008 Pass, 2026-04-15). Migration 026 live, Code-Grep sauber, 0 Policies mit `tenant_owner`. MT-4 Test-Automation formal offen, an SLC-002a delegiert (bewusst, beim Slice-Kickoff so abgestimmt). Naechster Implementierungs-Schritt: SLC-002a Test-Infrastruktur.
- Current Phase: V1 Implementation (SLC-002 done, SLC-002a als naechster aktiver Slice)

## Immediate Next Steps
1. SLC-002a starten: Test-Infrastruktur (Vitest + pg-Test-Helper + 2-Tenant-RLS-Test, schliesst ISSUE-002/004)
2. Nach SLC-002a: SLC-002b Admin + Demo-Tenant Seed (realer Login-Smoke-Test moeglich)
3. SLC-002c App-Branding (Medium, parallel oder nach 002b)
4. Ab SLC-003: Feature-Slices (Template-Content, Capture-Session, Questionnaire-UI, ...)

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md, 13 Slices):
- FEAT-001 Foundation Data Model & RBAC → SLC-001 (done), SLC-002 (planned), SLC-002a (planned), SLC-002b (planned), SLC-002c (planned)
- FEAT-002 Exit-Readiness Template → SLC-003 (planned)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (planned)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (planned)
- FEAT-005 Single-Pass AI Condensation → SLC-008 (planned)
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010 (planned)

## Blockers
- aktuell keine (SSH-Problem geloest 2026-04-15, Deploy durch, Business-DB aufgeraeumt)

## Known Issues (reference)
- ISSUE-002 Test-Infrastruktur fehlt — wird in SLC-002a behoben
- ISSUE-003 node_modules lokal nicht installiert — nur Dev-Convenience, Build auf Server laeuft
- ISSUE-004 2-Tenant-RLS-Isolation unverifiziert — wird in SLC-002a MT-4 nachgeholt
- ISSUE-005 App-Title Blueprint-Branding — wird in SLC-002c behoben
- ISSUE-007 JWT-Refresh-Randbedingung nach Rollen-Umbenennung — aktuell kein Handlungsbedarf
- ISSUE-008 Legacy-Route /api/tenant/runs/[runId]/feedback — mit ISSUE-006 im Cleanup-Slice bereinigen

## Last Stable Version
- V1-preview @ commit 6601cbe — deployed 2026-04-15, DB-Baseline + Capture-Schema + App bereit unter https://onboarding.strategaizetransition.com

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
