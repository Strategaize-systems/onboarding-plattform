# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: architecture
- Current Focus: V4-Architektur abgeschlossen. 7 Architektur-Entscheidungen DEC-034..040 dokumentiert (Bridge-Hybrid Q17, Passwort-Auth Q18, parallele Rollen Q19, on-demand Bridge Q20, Template-Schablone Handbuch Q21, on-demand Re-Run mit stale-Hinweis Q22, Hook-Granularitaet Worker+UI-Slot Q23). MIG-023 mit 11 Migrationen geplant. Capture-Mode-Hooks-Spike (walkthrough_stub) als SC-V4-6-Validierung im Architektur-Plan. 8 V4-Slices empfohlen. Naechster Schritt: /slice-planning V4. Parallel offen: V3 Go-Live + V3.1 Maintenance.
- Current Phase: V4 Architecture done

## Immediate Next Steps
1. /slice-planning V4 — 8 Slices (SLC-033..040) auf Basis ARCHITECTURE.md V4-Sektion und FEAT-022..027 detailliert ausarbeiten
2. Coolify-Redeploy V3 (User, manuell) auf Commit 3d2074a — bringt Back-Button (ISSUE-015) live
3. /deploy V3 nach Redeploy — REL-005, roadmap V3 auf released, V3-Features auf deployed
4. /post-launch V3 — nach 1-2 Tagen Produktivbetrieb
5. V3.1 Maintenance (BL-038..040, ~60 min) parallel zu V4-Planung moeglich

## Active Scope
**V4 — Zwei-Ebenen-Verschmelzung, 6 Features (planned), 8 Slices empfohlen:**
- FEAT-022 Employee Role + RBAC Extension
- FEAT-023 Blueprint-to-Employee Bridge Engine (Hybrid: Template-Schablone + KI-Verfeinerung + max 3 Free-Form-Vorschlaege, DEC-034)
- FEAT-024 Employee Capture Workflow
- FEAT-025 Capture-Mode Extension Hooks (Worker-Slot + UI-Slot, validiert per `walkthrough_stub` Spike, DEC-040)
- FEAT-026 Unternehmerhandbuch Foundation (deterministische Aggregation ueber `template.handbook_schema`, kein LLM in V4, DEC-038)
- FEAT-027 Self-Service Status Cockpit Foundation (regelbasierter "Naechster Schritt", kein LLM in V4)

V4 plant 11 Migrationen (065-075) und 8 Slices (SLC-033..040). Detail in /docs/ARCHITECTURE.md V4-Sektion und /docs/MIGRATIONS.md MIG-023.

V4.1 (Unternehmerhandbuch ausgebaut) und V4.2 (Self-Service-Cockpit ausgebaut) sind als Folge-Versionen in Roadmap; Detail-Requirements je in eigenem /requirements V4.1 / V4.2 wenn dran.

**V3 — Dialogue-Mode, 8 Slices done.** Go-Live approved (RPT-067). Wartet auf Coolify-Redeploy + /deploy V3 (formales Release, REL-005).

**V3.1 — Maintenance (3 Items, planned, nicht blockierend).** BL-038 AWS-SDK-Vuln, BL-039 admin-rls.test.ts Test-Isolation, BL-040 supabase-studio Healthcheck.

V2 — 12/12 Slices done, released (REL-004).

## Blockers
- aktuell keine

## Last Stable Version
- V2 — 2026-04-21 — released auf https://onboarding.strategaizetransition.com (REL-004).
- V3 — Go-Live approved (RPT-067), wartet auf Coolify-Redeploy + /deploy fuer formales REL-005.

## Notes
V4 wurde am 2026-04-23 in Planungs-Session auf Basis Personal Strategic Model V1 + SOFTWARE-EXECUTION-MAP definiert. Strategischer Rahmen: SOFTWARE-EXECUTION-MAP Phase 1 (8 Wochen) — Track A (V3 abschliessen) + Track B (V4 Requirements done) + Track C (V4 Implementation 3-4 Wochen).

Versions-Re-Numerierung 2026-04-23: V4 (alt = Walkthrough) -> V5; V5 (alt = Diary) -> V6; V6+ (alt = Queroptionen) -> V7+. Walkthrough + Diary werden Capture-Modi innerhalb des Onboarding-Pfades, Architektur-Hooks dafuer entstehen in V4 (FEAT-025, validiert per Pseudo-Mode `walkthrough_stub`).

V4-Architektur 2026-04-23 abgeschlossen. Q17 (Bridge-Mechanismus) und Q21 (Aggregations-Logik) wurden mit User-Input entschieden (IMP-110-Pflicht). Q18-Q20, Q22-Q23 mit User bestaetigten Empfehlungen. Alle 7 DECs (DEC-034..040) und 11 geplante Migrationen (065-075) dokumentiert.

Pflicht fuer V4-Implementation:
- 4-Rollen-RLS-Test-Matrix (4 Rollen × 8 Tabellen, mind. 32 Failure-Tests fuer employee-Sichtperimeter) als Pflicht-Bestandteil von /qa pro V4-Slice (R16, SC-V4-3).
- Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4-Release (R17 Mitarbeiter-UX, SC-V4-5 Self-Service-Cockpit).
- Capture-Mode-Hooks-Spike `walkthrough_stub` ist Bestandteil von SLC-038 — validiert SC-V4-6.
