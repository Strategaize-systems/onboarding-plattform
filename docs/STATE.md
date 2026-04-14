# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: slice-planning
- Current Focus: Slice-Planung abgeschlossen (2026-04-14). 10 Slices SLC-001..010 definiert mit Micro-Tasks (61 MTs gesamt), Priorisierung und Dependencies gesetzt. Bereit fuer /qa (Slice-Planning ist QA-pflichtig).
- Current Phase: Slice-Planning abgeschlossen, wartet auf /qa und danach SLC-001 Implementation

## Immediate Next Steps
1. /qa auf Slice-Planning-Output ausfuehren (Pflicht laut CLAUDE.md Workflow)
2. Nach QA-OK: SLC-001 Schema-Fundament starten (/backend, Worktree-Isolation)
3. SLC-001 abschliessen inkl. Hetzner-Migration-Deploy, dann /qa auf SLC-001
4. Iterativ durch SLC-002..010 in Reihenfolge; dependente Slices wo moeglich parallelisieren

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md):
- FEAT-001 Foundation Data Model & RBAC → SLC-001, SLC-002
- FEAT-002 Exit-Readiness Template → SLC-003
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006
- FEAT-004 Exception Mode Prompt Layer → SLC-007
- FEAT-005 Single-Pass AI Condensation → SLC-008
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010

## Blockers
- aktuell keine

## Last Stable Version
- none yet

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-spezifische Features (questionnaires, mirror, debrief) sind noch aktiv und werden in spaeteren Slices auf generische Plattform-Konzepte umgebaut oder als erstes Template gekapselt. ISSUE-001 (secrets-onboarding.txt im Repo-Root) ist resolved: `.gitignore` um `secrets-*.txt` / `*.secrets` / `secrets/` erweitert.

Architektur-Stand 2026-04-14: 5 neue Kerntabellen (template, capture_session, block_checkpoint, knowledge_unit, validation_layer), separater Worker-Container `worker` neben `app`, Queue-basierte Verdichtung via `ai_jobs`-Tabelle mit Bedrock (Claude Sonnet, eu-central-1). Rolle wird von `tenant_owner` auf `tenant_admin` umbenannt (DEC-010). Confidence-Skala = Enum low/medium/high (DEC-008). V1-Export = JSON only (DEC-009).

Slice-Planning-Stand 2026-04-14: 10 Slices mit je 4-9 Micro-Tasks, Migrations 021-033 skizziert, Worktree-Isolation fuer alle Slices mandatory (SaaS-Mode), TDD mandatory pro Slice. Kritische Abhaengigkeit: SLC-006 setzt `ai_jobs`-Tabelle voraus → MT-1 in SLC-006 klaert, ob Blueprint-Bestand oder Neu-Anlage noetig ist.
