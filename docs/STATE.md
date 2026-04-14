# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: deploying
- Current Focus: SLC-001 Deploy-Versuch am 2026-04-14 abgebrochen. User-Entscheidung: morgen (2026-04-15) komplett neu starten. Migrations-Code im Repo bleibt intakt, nur der Deploy-Weg wird neu aufgesetzt mit funktionierendem SSH-Zugang.
- Current Phase: V1 Implementation (SLC-001 blockiert)

## Immediate Next Steps
1. SSH-Zugang zu beiden Hetzner-Servern verifizieren (Business 91.98.20.191, Onboarding 159.69.207.29) — Key ist am 2026-04-14 hinzugefuegt, aber Login funktioniert noch nicht
2. Business-System aufraeumen: 5 versehentlich angelegte Onboarding-Tabellen + `_set_updated_at()` entfernen, `handle_new_user()` auf Business-System-Original restaurieren
3. Onboarding-Server sauber aufsetzen: Entscheidung separate Coolify-Supabase-Instanz (mit Blueprint-Stack daneben) vs. kompletter Server-Reset. Dann DB-Baseline + Migrations in einem Rutsch
4. Nach Deploy: /qa auf SLC-001, dann SLC-002

## Active Scope
V1 (siehe /docs/PRD.md, 6 Features), Implementierungs-Plan (siehe /slices/INDEX.md):
- FEAT-001 Foundation Data Model & RBAC → SLC-001 (Code fertig, Deploy offen), SLC-002 (planned)
- FEAT-002 Exit-Readiness Template → SLC-003 (planned)
- FEAT-003 Questionnaire Mode with Block-Submit → SLC-004, SLC-005, SLC-006 (planned)
- FEAT-004 Exception Mode Prompt Layer → SLC-007 (planned)
- FEAT-005 Single-Pass AI Condensation → SLC-008 (planned)
- FEAT-006 Debrief Meeting Interface → SLC-009, SLC-010 (planned)

## Blockers
- SSH-Access von Dev-Box zu beiden Hetzner-Servern funktioniert noch nicht, obwohl Key-Eintrag auf Onboarding-Server verifiziert wurde. Diagnose morgen. Bis dahin kein weiterer Deploy-Versuch.
- Business-System-DB hat versehentliche Onboarding-Artefakte (5 leere Tabellen, evtl. ueberschriebenes `handle_new_user()`). Aufraeumen morgen als erstes.
- ISSUE-002 Test-Infrastruktur fehlt — blockiert MT-5 RLS-Integrationstest
- ISSUE-003 node_modules nicht installiert — blockiert lokalen Type-Check

## Last Stable Version
- none yet

## Notes
Code-Basis uebernommen aus strategaize-blueprint-plattform V3.4 (Stand 2026-04-14). SLC-001 Code ist im Repo korrekt committed (Migrations 020b/021/022/023 + Query-Layer + Report). Nur der Deploy-Pfad war chaotisch und wird morgen neu aufgesetzt mit SSH-basiertem Workflow statt Base64-Paste. Heutige Lessons dokumentiert in Dev-System-SKILL_IMPROVEMENTS.md IMP-038 bis IMP-040 und in Memory `session_handoff_2026_04_14_slc001_abort.md`.
