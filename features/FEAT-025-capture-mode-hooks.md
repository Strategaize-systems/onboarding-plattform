# FEAT-025 — Capture-Mode Extension Hooks (Walkthrough + Diary Architecture)

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Strukturierte Erweiterungs-Schnittstelle fuer zusaetzliche Capture-Modi. Bereitet die Architektur fuer Walkthrough-Mode (V5) und Diary-Mode (V6) vor, ohne sie zu bauen.

## Hintergrund
SOFTWARE-EXECUTION-MAP definiert: Walkthrough und Diary werden Capture-Modi INNERHALB des Onboarding-Pfades. V4 bereitet die Hooks vor, damit V5/V6 sauber andocken koennen — ohne dass V5 das Schema breit umbauen muss.

## In Scope
- `capture_mode`-Enum auf `capture_session` formal definiert (questionnaire, exception, evidence, voice, dialogue, walkthrough, diary)
- Worker-Pipeline-Hook-Konvention: Wie meldet sich ein neuer Mode-Worker an?
- UI-Slot-Konvention: Wo wird ein neuer Mode in der Capture-Session-UI gerendert?
- Pseudo-Mode-Validation in /architecture: Mit Test-Mode "walkthrough_stub" wird gezeigt, dass das System einen neuen Mode aufnimmt ohne Schema-Aenderung
- Dokumentation der Hook-Konvention in /docs/ARCHITECTURE.md

## Out of Scope
- Implementation von Walkthrough-Mode (V5)
- Implementation von Diary-Mode (V6)
- Mobile-Layout fuer Diary
- Browser-Extension oder Native-App fuer Walkthrough
- Tech-Decision-Spike fuer Walkthrough (gehoert zu V5)

## Akzeptanzkriterien (Skizze)
- `capture_mode`-Enum erweitert, alle bestehenden Modi konsistent benannt
- Worker-Hook-Konvention dokumentiert + ein Pseudo-Worker zeigt Anbindung
- UI-Slot-Konvention dokumentiert + ein Pseudo-UI-Stub zeigt Anbindung
- Architecture-Doku enthaelt klaren "How to add a new Capture-Mode"-Abschnitt

## Abhaengigkeiten
- Keine harten Abhaengigkeiten — kann parallel zu FEAT-022..024 implementiert werden

## Verweise
- PRD V4-Sektion (SC-V4-6, R20)
- DEC offen — Q23 Hook-Granularitaet
- SOFTWARE-EXECUTION-MAP 2026-04-23, Eintrag "Walkthrough/Diary werden Capture-Modi innerhalb V4"
