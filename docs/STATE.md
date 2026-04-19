# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: released
- Current Focus: V1.1 released. Naechste Arbeit: V2 Planung oder Business System V4.3.
- Current Phase: Stable (V1.1)

## Immediate Next Steps
1. Business System V4.3 /architecture
2. Onboarding V2 Planung (bei Bedarf)

## Active Scope
V1.1 Maintenance Release (3 Features) — RELEASED:
- FEAT-007 Blueprint-Legacy-Cleanup — done (SLC-011)
- FEAT-008 Dashboard Capture-Sessions — done (SLC-012)
- FEAT-009 Error-Logging — done (SLC-012)

## Blockers
- aktuell keine

## Known Issues (reference)
- ISSUE-007 JWT-Refresh-Randbedingung nach Rollen-Umbenennung — Low, aktuell kein Handlungsbedarf
- ISSUE-014 Voice-Input nicht verdrahtet — Low, bewusst deaktiviert in V1

## Last Stable Version
- V1.1 — 2026-04-19 — released auf https://onboarding.strategaizetransition.com (REL-003). Post-Launch STABLE (RPT-037).

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). Blueprint-Stack laeuft unveraendert parallel auf blueprint.strategaizetransition.com (selber Hetzner-Server, separate Coolify-Resource).

Deploy-Historie:
- 2026-04-14: Erster Deploy-Versuch gescheitert (Hostname-Kollision zwischen Business- und Onboarding-Server, SSH-Passphrase unklar, Migrations landeten auf Business-DB statt Onboarding-DB)
- 2026-04-15: SSH-Zugang ueber dedizierten claude-deploy-Key eingerichtet, Business-DB aufgeraeumt (ISSUE-030 in Business-Repo), Onboarding-Init-Scripts auf Onboarding-Scope reduziert (commit 6601cbe), Redeploy erfolgreich

Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040.
