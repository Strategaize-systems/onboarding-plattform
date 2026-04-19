# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: implementing
- Current Focus: V2 Scope-Erweiterung. SLC-013..017 done (5/12). FEAT-010, FEAT-011, FEAT-012 komplett. FEAT-016 Architektur + Slice-Planning done — bereit fuer Implementation.
- Current Phase: V2 Implementation (FEAT-016 Diagnose-Layer)

## Immediate Next Steps
1. /backend SLC-023 (Diagnose-Backend: block_diagnosis + Worker + RPCs + Template-Seed, 8 MTs)
2. /qa SLC-023
3. /frontend SLC-024 (Diagnose-Frontend + SOP-Gate, 7 MTs)
4. /qa SLC-024

## Active Scope
V2 — 12 Slices (5/12 done):
- SLC-013 Orchestrator-Integration (6 MTs) — done
- SLC-014 Gap-Question-Backend (7 MTs) — done
- SLC-015 Backspelling-UI (6 MTs) — done
- SLC-016 SOP-Backend (7 MTs) — done
- SLC-017 SOP-UI (6 MTs) — done
- SLC-018 Evidence-Schema+Storage (5 MTs) — High
- SLC-019 Evidence-Extraction+Mapping (8 MTs) — High
- SLC-020 Evidence-UI (6 MTs) — High
- SLC-021 Template-Switcher (7 MTs) — Medium
- SLC-022 Whisper-Voice-Input (7 MTs) — Medium
- SLC-023 Diagnose-Backend (8 MTs) — Blocker (FEAT-016)
- SLC-024 Diagnose-Frontend + SOP-Gate (7 MTs) — Blocker (FEAT-016)

## Blockers
- aktuell keine

## Last Stable Version
- V1.1 — 2026-04-19 — released auf https://onboarding.strategaizetransition.com (REL-003).

## Notes
Parallelisierungs-Potential: Evidence-Kette (SLC-018..020) kann parallel zur Orchestrator+SOP-Kette (SLC-013..017) laufen. Whisper (SLC-022) ist komplett unabhaengig.
