# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: released
- Current Focus: V1 released und stabil (REL-002, 2026-04-18). E2E 10/10 PASS. Post-Launch STABLE (RPT-032).
- Current Phase: V1 Released

## Immediate Next Steps
1. V1.1 planen (Legacy-Cleanup ISSUE-011, Dashboard ISSUE-012, error_log ISSUE-013)
2. Oder: V2 Discovery (3-Agenten-Loop, Evidence-Mode, zweites Template)

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md, 13 Slices):
- FEAT-001 Foundation Data Model & RBAC → SLC-001..002d (done)
- FEAT-002 Exit-Readiness Template → SLC-003 (done)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (done)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (reverted, kein Use-Case)
- FEAT-005 Multi-Agent AI Condensation + Blueprint-Chat-Flow → SLC-008 (done, pending Coolify-Redeploy)
- FEAT-006 Debrief Meeting Interface → SLC-009 (done), SLC-010 (done)

## Blockers
- aktuell keine

## Known Issues (reference)
- ISSUE-002 Test-Infrastruktur fehlt — resolved (SLC-002a, 2026-04-15)
- ISSUE-003 node_modules lokal nicht installiert — nur Dev-Convenience, Build auf Server laeuft
- ISSUE-004 2-Tenant-RLS-Isolation unverifiziert — resolved (SLC-002a MT-4, 2026-04-15)
- ISSUE-005 App-Title Blueprint-Branding — resolved (SLC-002c, 2026-04-16)
- ISSUE-007 JWT-Refresh-Randbedingung nach Rollen-Umbenennung — aktuell kein Handlungsbedarf
- ISSUE-008 Legacy-Route /api/tenant/runs/[runId]/feedback — resolved (SLC-002d, 2026-04-16)
- ISSUE-009 Blueprint-Profile-Flow Silent Failure — resolved (SLC-002d, 2026-04-16)

## Last Stable Version
- V1 — 2026-04-18 — released auf https://onboarding.strategaizetransition.com (REL-002). E2E 10/10 PASS. Post-Launch STABLE (RPT-032).

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
