# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: implementing
- Current Focus: SLC-037 Employee Capture-UI + Sicht-Perimeter — **Backend implementiert, /qa offen**. Alle 9 Micro-Tasks abgeschlossen: EmployeeQuestionnaireMode-Wrapper + Mode-Registry, /employee Aufgaben-Liste mit Status-Badges, /employee/capture/[sessionId] + /block/[blockKey] Routes mit owner_user_id-Check, Worker-Side capture_mode→source-Tag in handleCondensationJob, Middleware-Block fuer employee auf /admin /dashboard /capture, Debrief-Badge "Mitarbeiter" mit teal-Akzent, RLS-Perimeter-Matrix (43 Tests: 32 Pflicht + 8 PASS + 2 Bonus + 1 Trigger). `npm run build` 7.3s gruen, alle 3 neuen Routes kompiliert. RPT-083 Backend-Completion. Naechster Schritt: /qa SLC-037 Phase 1 (statisch) + Phase 2 (Live-Smoke gegen Demo-Tenant), beide Pflicht (IMP-139). 2 Test-Sessions im Demo-Tenant (richard@bellaerts.de, capture_mode='employee_questionnaire') stehen bereit.
- Current Phase: V4 Implementation — 4/8 Slices done + SLC-037 Backend done, /qa offen. FEAT-022 + FEAT-024 erwartete Done nach /qa.

## Immediate Next Steps
1. **/qa SLC-037** — Phase 1 (statisch) + Phase 2 (Live-Smoke), kein deferred (IMP-139). AC-1..AC-11. Inkl. Cross-Tenant-Smoke + Browser-Klick als Mitarbeiter (richard@bellaerts.de) auf 2 Test-Sessions + RLS-Tests gegen Coolify-DB (`TEST_DATABASE_URL=... npm run test -- v4-perimeter-matrix` → 43 PASS erwartet).
2. **Mobile-Viewport-Smoke fuer SLC-036** (deferred): wenn Zeit, im DevTools Mobile-Mode pruefen, dass Karten + Edit-Dialog auf <400px sauber rendern.
3. **/post-launch** fuer SLC-034 + SLC-036 nach 1-2 Tagen Produktivbetrieb (optional, low-risk).

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

**V3.1 — Maintenance (3 Items, code done 2026-04-24, wartet auf Deploy).** BL-038 AWS-SDK Upgrade 3.1024→3.1036 + npm-Override `@xmldom/xmldom@^0.8.13` via mammoth → `npm audit --omit=dev` = 0 Vulns. BL-039 admin-rls.test.ts drei Assertions mit `WHERE tenant_id IN ($1,$2)` isoliert → ISSUE-018 resolved. BL-040 supabase-studio Healthcheck in docker-compose.yml deaktiviert → DEC-041, ISSUE-020 als `wontfix` geschlossen. Runtime-Verification: Bedrock-Smoke via Condensation-Worker nach User-Deploy.

V2 — 12/12 Slices done, released (REL-004).

## Blockers
- aktuell keine

## Last Stable Version
- V4-FEAT-023 — 2026-04-25 — Bridge Engine deployed + Live-Smoke PASS (Demo-Tenant). Deploy-Commits 82c987e..89836b4 (SLC-035 + SLC-036). 2 Mitarbeiter-Sessions live spawned (Kundenbetreuung + Operative -> richard@bellaerts.de), 1 Reject-Test (Produktentwicklung), Cost-Audit $0.0153 fuer Live-Bridge-Run. 7 In-Phase-Bugs in /qa entdeckt + gefixt (siehe Current Focus). 2 Migrations live (076 RLS-Policy + 077 Schema-USAGE).
- V4-SLC-034 — 2026-04-24 — released auf https://onboarding.strategaizetransition.com (REL-007), Deploy-Commit 82c987e. Erster echter V4-Feature-Release: Employee-Auth + Invitation-Flow, Mitarbeiter-Verwaltung, /accept-invitation, /employee-Dashboard-Skelett. User-Browser-Smoke bestaetigt.
- V3.1 — 2026-04-24 — released (REL-006), Deploy-Commit cffc639. Maintenance-Release + dormant V4-Schema.
- V3 — 2026-04-24 — released (REL-005), Deploy-Commit e775ff0.
- V2 — 2026-04-21 — released (REL-004).

## Notes
V4 wurde am 2026-04-23 in Planungs-Session auf Basis Personal Strategic Model V1 + SOFTWARE-EXECUTION-MAP definiert. Strategischer Rahmen: SOFTWARE-EXECUTION-MAP Phase 1 (8 Wochen) — Track A (V3 abschliessen) + Track B (V4 Requirements done) + Track C (V4 Implementation 3-4 Wochen).

Versions-Re-Numerierung 2026-04-23: V4 (alt = Walkthrough) -> V5; V5 (alt = Diary) -> V6; V6+ (alt = Queroptionen) -> V7+. Walkthrough + Diary werden Capture-Modi innerhalb des Onboarding-Pfades, Architektur-Hooks dafuer entstehen in V4 (FEAT-025, validiert per Pseudo-Mode `walkthrough_stub`).

V4-Architektur 2026-04-23 abgeschlossen. Q17 (Bridge-Mechanismus) und Q21 (Aggregations-Logik) wurden mit User-Input entschieden (IMP-110-Pflicht). Q18-Q20, Q22-Q23 mit User bestaetigten Empfehlungen. Alle 7 DECs (DEC-034..040) und 11 geplante Migrationen (065-075) dokumentiert.

Pflicht fuer V4-Implementation:
- 4-Rollen-RLS-Test-Matrix (4 Rollen × 8 Tabellen, mind. 32 Failure-Tests fuer employee-Sichtperimeter) als Pflicht-Bestandteil von /qa pro V4-Slice (R16, SC-V4-3).
- Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4-Release (R17 Mitarbeiter-UX, SC-V4-5 Self-Service-Cockpit).
- Capture-Mode-Hooks-Spike `walkthrough_stub` ist Bestandteil von SLC-038 — validiert SC-V4-6.
