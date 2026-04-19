# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding).

## Current State
- High-Level State: architecture
- Current Focus: V2 Architecture abgeschlossen. 5 neue DECs (DEC-017..021), 10 Migrations geplant (MIG-013), 10 Slices empfohlen. Naechster Schritt: /slice-planning.
- Current Phase: V2 Architecture

## Immediate Next Steps
1. V2 /slice-planning (10 Slices mit Micro-Tasks)
2. Dann /backend SLC-013 (Orchestrator-Integration)

## Active Scope
V2 — Intelligence Upgrade + Evidence + Template-Expansion (6 Features):
- FEAT-010 3-Agent Orchestrator Loop — planned
- FEAT-011 Auto-Gap-Backspelling — planned
- FEAT-012 SOP Generation (Level 2) — planned
- FEAT-013 Evidence-Mode + Bulk-Import — planned
- FEAT-014 Second Template + Switcher UI — planned
- FEAT-015 Voice Input (Whisper) — planned

## Blockers
- aktuell keine

## Last Stable Version
- V1.1 — 2026-04-19 — released auf https://onboarding.strategaizetransition.com (REL-003). Post-Launch STABLE (RPT-037).

## Notes
V2-Architektur-Kernentscheidungen:
- DEC-017: Alle neuen Job-Types im bestehenden Worker (kein neuer Service)
- DEC-018: Self-hosted Whisper + Adapter-Pattern (Container existiert bereits)
- DEC-019: Evidence in Supabase Storage (tenant-isoliert)
- DEC-020: SOP on-demand (nicht automatisch)
- DEC-021: Demo-Template PoC, Template-Editor erst V3

Keine neuen Docker-Services. Keine neuen Cloud-Provider. Bestehende Infrastruktur wird erweitert.
