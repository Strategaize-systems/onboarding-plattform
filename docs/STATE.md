# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: slice-planning
- Current Focus: V4 Slice-Planning abgeschlossen (2026-04-24) — 8 Slice-Files SLC-033..040 unter /slices/ dokumentiert, mit Micro-Tasks, Migrations-Zuordnung, Pflicht-QA-Vorgaben (RLS-Matrix 32 Faelle, Nicht-Tech-User-Smoke-Test, walkthrough_stub Spike). Naechster Schritt: /backend SLC-033 (V4 Schema-Fundament). V3 released + live, V3.1 Maintenance parallel moeglich.
- Current Phase: V4 Slice-Planning done

## Immediate Next Steps
1. /backend SLC-033 — V4 Schema-Fundament (Migrations 065-071 + 075 + RLS-Test-Matrix-Skelett). Blocker fuer alle weiteren V4-Slices.
2. /post-launch V3 — nach 1-2 Tagen Produktivbetrieb Stabilitaetscheck (parallel moeglich).
3. V3.1 Maintenance (BL-038..040, ~60 min) parallel einplanen.

## Active Scope
**V4 — Zwei-Ebenen-Verschmelzung, 6 Features (planned), 8 Slices planned:**
- FEAT-022 Employee Role + RBAC Extension — SLC-033 + SLC-034 + SLC-037
- FEAT-023 Blueprint-to-Employee Bridge Engine — SLC-035 + SLC-036
- FEAT-024 Employee Capture Workflow — SLC-037
- FEAT-025 Capture-Mode Extension Hooks — SLC-038 (walkthrough_stub Spike)
- FEAT-026 Unternehmerhandbuch Foundation — SLC-039 + SLC-040
- FEAT-027 Self-Service Status Cockpit Foundation — SLC-040

V4 plant 11 Migrationen (065-075) und 8 Slices (SLC-033..040). Alle 8 Slice-Files unter /slices/ dokumentiert (2026-04-24). Detail in /docs/ARCHITECTURE.md V4-Sektion und /docs/MIGRATIONS.md MIG-023.

**V4-Execution-Reihenfolge:** 033 → 034 → 035 → 036 → 037 → 038 ∥ 039 → 040.
Pflicht-Gates: 033/037 RLS-Matrix 32 Faelle gruen, 038 SC-V4-6-Beweis, 040 Nicht-Tech-User-Smoke-Test.

V4.1 (Unternehmerhandbuch ausgebaut) und V4.2 (Self-Service-Cockpit ausgebaut) sind als Folge-Versionen in Roadmap; Detail-Requirements je in eigenem /requirements V4.1 / V4.2 wenn dran.

**V3 — Dialogue-Mode, 8 Slices done, released 2026-04-24 (REL-005).** Alle 5 Features live. Smoke-Test PASS, Gesamt-QA PASS (RPT-065), Final-Check PASS (RPT-066), Go-Live GO (RPT-067), Deploy done (RPT-070).

**V3.1 — Maintenance (3 Items, planned, nicht blockierend).** BL-038 AWS-SDK-Vuln, BL-039 admin-rls.test.ts Test-Isolation, BL-040 supabase-studio Healthcheck.

V2 — 12/12 Slices done, released (REL-004).

## Blockers
- aktuell keine

## Last Stable Version
- V3 — 2026-04-24 — released auf https://onboarding.strategaizetransition.com (REL-005), Deploy-Commit e775ff0.
- V2 — 2026-04-21 — released (REL-004).

## Notes
V4 wurde am 2026-04-23 in Planungs-Session auf Basis Personal Strategic Model V1 + SOFTWARE-EXECUTION-MAP definiert. Strategischer Rahmen: SOFTWARE-EXECUTION-MAP Phase 1 (8 Wochen) — Track A (V3 abschliessen) + Track B (V4 Requirements done) + Track C (V4 Implementation 3-4 Wochen).

Versions-Re-Numerierung 2026-04-23: V4 (alt = Walkthrough) -> V5; V5 (alt = Diary) -> V6; V6+ (alt = Queroptionen) -> V7+. Walkthrough + Diary werden Capture-Modi innerhalb des Onboarding-Pfades, Architektur-Hooks dafuer entstehen in V4 (FEAT-025, validiert per Pseudo-Mode `walkthrough_stub`).

V4-Architektur 2026-04-23 abgeschlossen. Q17 (Bridge-Mechanismus) und Q21 (Aggregations-Logik) wurden mit User-Input entschieden (IMP-110-Pflicht). Q18-Q20, Q22-Q23 mit User bestaetigten Empfehlungen. Alle 7 DECs (DEC-034..040) und 11 geplante Migrationen (065-075) dokumentiert.

Pflicht fuer V4-Implementation:
- 4-Rollen-RLS-Test-Matrix (4 Rollen × 8 Tabellen, mind. 32 Failure-Tests fuer employee-Sichtperimeter) als Pflicht-Bestandteil von /qa pro V4-Slice (R16, SC-V4-3).
- Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4-Release (R17 Mitarbeiter-UX, SC-V4-5 Self-Service-Cockpit).
- Capture-Mode-Hooks-Spike `walkthrough_stub` ist Bestandteil von SLC-038 — validiert SC-V4-6.
