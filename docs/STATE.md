# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: requirements
- Current Focus: V3 Dialogue-Mode Requirements abgeschlossen. 5 Features definiert (FEAT-017..021). Naechster Schritt: /architecture.
- Current Phase: V3 Requirements

## Immediate Next Steps
1. /architecture fuer V3 (Jitsi-Deployment-Strategie, Datenmodell, Pipeline-Design, offene Fragen Q12-Q16)
2. /slice-planning V3
3. Implementation V3

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
V3 Discovery + Requirements am 2026-04-21 abgeschlossen. Kernentscheidungen: Eigene Jitsi-Instanz (kein Shared-Infra), Meeting-Guide Basic (Premium nur mit Intelligence Platform), Mid-Meeting-KI nicht in V3 (V3.1). Offene Architektur-Fragen: Speaker Diarization (Q12), Teilnehmer-Modell (Q13), Meeting-Guide KI-Stufe (Q14), Recording-Storage (Q15), Transkript-Persistence (Q16).
