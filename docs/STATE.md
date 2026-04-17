# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: implementing
- Current Focus: SLC-003 done (2026-04-17). Exit-Readiness Template v1.0.0 in DB geseedet: 9 Bloecke (A-I), 73 Fragen aus Blueprint V3.4. LLM-Prompts von "Blueprint" auf generische Referenzen umgestellt (7 Stellen). Migration 029 auf Hetzner deployed und verifiziert. FEAT-002 abgeschlossen.
- Current Phase: V1 Implementation (7/13 Slices done: SLC-001..002d + SLC-003. FEAT-001 + FEAT-002 abgeschlossen. Naechster Track: FEAT-003 ab SLC-004)

## Immediate Next Steps
1. /qa fuer SLC-003 (mandatory nach /backend)
2. SLC-004 Capture-Session-Start + Block-Listing — naechste Feature-Slice (FEAT-003)
3. Ab SLC-005: Questionnaire-UI, Block-Submit, Exception-Mode, ...

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
- ISSUE-002 Test-Infrastruktur fehlt — resolved (SLC-002a, 2026-04-15)
- ISSUE-003 node_modules lokal nicht installiert — nur Dev-Convenience, Build auf Server laeuft
- ISSUE-004 2-Tenant-RLS-Isolation unverifiziert — resolved (SLC-002a MT-4, 2026-04-15)
- ISSUE-005 App-Title Blueprint-Branding — resolved (SLC-002c, 2026-04-16)
- ISSUE-007 JWT-Refresh-Randbedingung nach Rollen-Umbenennung — aktuell kein Handlungsbedarf
- ISSUE-008 Legacy-Route /api/tenant/runs/[runId]/feedback — resolved (SLC-002d, 2026-04-16)
- ISSUE-009 Blueprint-Profile-Flow Silent Failure — resolved (SLC-002d, 2026-04-16)

## Last Stable Version
- V1-preview @ commit ae2cdc2 — deployed 2026-04-17 (Migration 029 nur, kein App-Redeploy). Exit-Readiness Template v1.0.0 in Prod-DB (9 Bloecke, 73 Fragen).

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
