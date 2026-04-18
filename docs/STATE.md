# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: requirements
- Current Focus: V1.1 Maintenance Release — Requirements definiert. 3 Features (FEAT-007..009), 4 Backlog-Items (BL-022..025).
- Current Phase: V1.1 Requirements

## Immediate Next Steps
1. /architecture fuer V1.1 (minimal — kein neues Schema-Design noetig, nur Cleanup + Dashboard-Datenquelle + 1 Migration)
2. /slice-planning fuer V1.1
3. Implementation (voraussichtlich 2-3 Slices)

## Active Scope
V1.1 Maintenance Release (3 Features):
- FEAT-007 Blueprint-Legacy-Cleanup — ~41 tote Dateien + 17 Legacy-Migrations entfernen (ISSUE-011, ISSUE-006)
- FEAT-008 Dashboard Capture-Sessions — Dashboard auf echte Capture-Sessions umbauen (ISSUE-012)
- FEAT-009 Error-Logging — error_log-Tabelle erstellen (ISSUE-013)
- Plus: ISSUE-003 npm install lokal (Dev-Convenience)

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
