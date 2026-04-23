# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: requirements
- Current Focus: V4-Requirements abgeschlossen (Zwei-Ebenen-Verschmelzung). Roadmap re-numeriert (Walkthrough V4 -> V5, Diary V5 -> V6, Queroptionen V6+ -> V7+). 6 V4-Features definiert (FEAT-022..027). V4.1 + V4.2 als Folge-Versionen geplant. Naechster Schritt: /architecture V4 mit Q17-Q23. Parallel offen: V3 Go-Live + V3.1 Maintenance.
- Current Phase: V4 Planning

## Immediate Next Steps
1. /architecture V4 — Bridge-Mechanismus Q17, Auth-Flow Q18, Aggregations-Logik Q21, Hook-Granularitaet Q23 entscheiden
2. Coolify-Redeploy V3 (User, manuell) auf Commit 3d2074a — bringt Back-Button (ISSUE-015) live
3. /deploy V3 nach Redeploy — REL-005, roadmap V3 auf released, V3-Features auf deployed
4. /post-launch V3 — nach 1-2 Tagen Produktivbetrieb
5. V3.1 Maintenance (BL-038..040, ~60 min) parallel zu V4-Architecture moeglich

## Active Scope
**V4 — Zwei-Ebenen-Verschmelzung, 6 Features (planned):**
- FEAT-022 Employee Role + RBAC Extension
- FEAT-023 Blueprint-to-Employee Bridge Engine
- FEAT-024 Employee Capture Workflow
- FEAT-025 Capture-Mode Extension Hooks (Walkthrough + Diary Architecture)
- FEAT-026 Unternehmerhandbuch Foundation (Datenmodell + Markdown-Export)
- FEAT-027 Self-Service Status Cockpit Foundation

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

Versions-Re-Numerierung 2026-04-23: V4 (alt = Walkthrough) -> V5; V5 (alt = Diary) -> V6; V6+ (alt = Queroptionen) -> V7+. Walkthrough + Diary werden Capture-Modi innerhalb des Onboarding-Pfades, Architektur-Hooks dafuer entstehen in V4 (FEAT-025).

V4-Open-Questions Q17-Q23 werden in /architecture entschieden. Bridge-Mechanismus Q17 (KI-Free-Form vs. Template-Mapping vs. Hybrid) ist die kritischste Entscheidung — beeinflusst R15 (Bridge-Qualitaet).

Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4-Release wegen R17 (Mitarbeiter-UX) und SC-V4-5 (Self-Service-Cockpit).
