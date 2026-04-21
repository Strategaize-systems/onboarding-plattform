# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: architecture
- Current Focus: V3 Dialogue-Mode Architecture abgeschlossen. 6 neue DECs (DEC-025..030), 5 geplante Migrationen, 8 Slices vorgeschlagen. Naechster Schritt: /slice-planning.
- Current Phase: V3 Architecture

## Immediate Next Steps
1. /slice-planning fuer V3 (8 Slices mit Micro-Tasks)
2. Implementation V3 (SLC-025 Jitsi-Infra zuerst)

## Active Scope
V3 — Dialogue-Mode (Strukturierte Wissenserhebung durch Gespraeche):
- FEAT-017 Jitsi Meeting Infrastructure — planned
- FEAT-018 Meeting Guide (Basic) — planned
- FEAT-019 Dialogue Session (Video-Call + Recording) — planned
- FEAT-020 Recording-to-Knowledge Pipeline — planned
- FEAT-021 Dialogue Pipeline Integration — planned

V2 — 12/12 Slices done, released (REL-004).

## Blockers
- aktuell keine

## Last Stable Version
- V2 — 2026-04-21 — released auf https://onboarding.strategaizetransition.com (REL-004).

## Notes
V3 Discovery + Requirements + Architecture am 2026-04-21. Alle Architektur-Fragen beantwortet: Eigene Jitsi-Instanz (DEC-025), keine Speaker Diarization (DEC-026), Accounts fuer beide Teilnehmer (DEC-027), Recording in Supabase Storage (DEC-028), Transkript persistent (DEC-029), Meeting Guide als separate Tabelle (DEC-030). 8 Slices vorgeschlagen (SLC-025..032).
