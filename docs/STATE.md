# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: implementing
- Current Focus: SLC-008 Teil A (Blueprint-Chat-Flow) live-verifiziert (2026-04-18). Chat + Summary + Event-History + Memory + Sidebar funktionieren. Teil B (Worker + Multi-Agent-Loop) als naechster Schritt.
- Current Phase: V1 Implementation (10/13 Slices done: SLC-001..006. FEAT-001..003 done. FEAT-004 reverted. FEAT-005 Teil A live, Teil B planned. FEAT-006 planned.)

## Immediate Next Steps
1. SLC-008 /backend — Teil B: Worker-Container + Multi-Agent-Loop (MT-1..MT-10)
2. SLC-009 Debrief-UI + KU-Editor (FEAT-006)
3. SLC-010 Meeting-Snapshot + JSON-Export (FEAT-006)

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md, 13 Slices):
- FEAT-001 Foundation Data Model & RBAC → SLC-001..002d (done)
- FEAT-002 Exit-Readiness Template → SLC-003 (done)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (done)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (reverted, kein Use-Case)
- FEAT-005 Multi-Agent AI Condensation + Blueprint-Chat-Flow → SLC-008 (Teil A done, Teil B planned)
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010 (planned)

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
- V1-preview @ acb5713 — 2026-04-18. 10/13 Slices done. SLC-008 Teil A live-verifiziert (Chat-Flow + Summary + Event-History + Memory + Sidebar). Migrations 033+034 deployed. Bedrock Cross-Region Inference Profile fix (eu.anthropic.claude-sonnet-4-20250514-v1:0).

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
