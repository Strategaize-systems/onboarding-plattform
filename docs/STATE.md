# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: implementing
- Current Focus: SLC-001 Schema-Fundament umgesetzt (MT-1..4). Migrationen 021-023 committed, Query-Layer (template / capture_session / knowledge_unit) committed. MT-5 RLS-Integrationstest blockiert durch fehlende Test-Infrastruktur (ISSUE-002). MT-6 Hetzner-Deploy bereit, wartet auf User.
- Current Phase: V1 Implementation (SLC-001 partiell)

## Immediate Next Steps
1. User-Entscheidung zu ISSUE-002 (Test-Infra: Vitest installieren? Rule-4-Stop)
2. MT-6 Hetzner-Deploy: Migrationen 021/022/023 nach Rule `sql-migration-hetzner` ausfuehren
3. Nach Deploy: Verifikation `\dt` + 2-Tenant-RLS-Check per psql-Script
4. /qa auf SLC-001 nach Deploy + Test-Infra-Setup
5. Danach SLC-002 Rollen-Umbenennung

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md):
- FEAT-001 Foundation Data Model & RBAC → SLC-001 (in_progress), SLC-002 (planned)
- FEAT-002 Exit-Readiness Template → SLC-003 (planned)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (planned)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (planned)
- FEAT-005 Single-Pass AI Condensation → SLC-008 (planned)
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010 (planned)

## Blockers
- ISSUE-002 Test-Infrastruktur fehlt — blockiert MT-5 RLS-Integrationstest und saemtliche QA mit TDD-Anspruch
- ISSUE-003 node_modules nicht installiert — blockiert lokalen Type-Check und Build-Verifikation

## Last Stable Version
- none yet

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-spezifische Features (questionnaires, mirror, debrief) sind noch aktiv und werden in spaeteren Slices auf generische Plattform-Konzepte umgebaut oder als erstes Template gekapselt.

Architektur-Stand 2026-04-14: 5 neue Kerntabellen (template, capture_session, block_checkpoint, knowledge_unit, validation_layer), separater Worker-Container `worker` neben `app`, Queue-basierte Verdichtung via `ai_jobs`-Tabelle mit Bedrock (Claude Sonnet, eu-central-1). Rolle wird von `tenant_owner` auf `tenant_admin` umbenannt (DEC-010). Confidence-Skala = Enum low/medium/high (DEC-008). V1-Export = JSON only (DEC-009).

SLC-001 Code-Stand 2026-04-14: Migrationen 021 (Schema + RLS-Enable + Trigger), 022 (Policies), 023 (Indizes) committed. Query-Layer unter `src/lib/db/` mit Zod-validierten Row-Schemas. Worktree-Isolation bewusst ausgesetzt (Solo-User-Workflow, elevated Context — Abweichung in RPT-005 dokumentiert).
