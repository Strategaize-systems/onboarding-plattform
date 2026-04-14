# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: architecture
- Current Focus: Architektur abgeschlossen (2026-04-14). ARCHITECTURE.md vollstaendig, DEC-007..DEC-010 gesetzt, MIG-001 Baseline skizziert, 10 Slices als Empfehlung. Bereit fuer /slice-planning.
- Current Phase: Architecture abgeschlossen, wartet auf /slice-planning

## Immediate Next Steps
1. /slice-planning starten (Basis: docs/ARCHITECTURE.md + features/FEAT-001..006, Scope V1 alle 10 Slices)
2. Erster Slice-Implementierungs-Zyklus (SLC-001 Schema-Fundament)
3. Erster Deploy auf Hetzner nach SLC-001 / SLC-002 (Schema + Rollen-Umbau auf echter DB verifizieren)

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features):
- FEAT-001 Foundation Data Model & RBAC
- FEAT-002 Exit-Readiness Template
- FEAT-003 Questionnaire Mode with Block-Submit
- FEAT-004 Exception Mode Prompt Layer
- FEAT-005 Single-Pass AI Condensation
- FEAT-006 Debrief Meeting Interface

## Blockers
- aktuell keine

## Last Stable Version
- none yet

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-spezifische Features (questionnaires, mirror, debrief) sind noch aktiv und werden in spaeteren Slices auf generische Plattform-Konzepte umgebaut oder als erstes Template gekapselt. ISSUE-001 (secrets-onboarding.txt im Repo-Root) ist resolved: `.gitignore` um `secrets-*.txt` / `*.secrets` / `secrets/` erweitert.

Architektur-Stand 2026-04-14: 5 neue Kerntabellen (template, capture_session, block_checkpoint, knowledge_unit, validation_layer), separater Worker-Container `worker` neben `app`, Queue-basierte Verdichtung via `ai_jobs`-Tabelle mit Bedrock (Claude Sonnet, eu-central-1). Rolle wird von `tenant_owner` auf `tenant_admin` umbenannt (DEC-010). Confidence-Skala = Enum low/medium/high (DEC-008). V1-Export = JSON only (DEC-009).
