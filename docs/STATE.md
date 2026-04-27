# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: implementing
- Current Focus: /qa SLC-039 Phase 2 durchgelaufen (RPT-088). 9/12 ACs PASS, 3 ACs PASS-mit-Findings. Wiring End-to-End live verifiziert: RPC -> ai_jobs -> Worker (lokal-gebautes Smoke-Bundle in worker-Container ausgefuehrt) -> Render -> ZIP -> Storage-Upload -> Snapshot-Update -> Signed-URL-Roundtrip. 2 Live-Snapshots erzeugt (5-KU-Session 86d18dd6 = 4524 bytes ZIP, Empty-Session 560a77f2 = 3014 bytes ZIP). **2 neue Issues:** ISSUE-024 (HIGH, F4 SOP-Renderer-Schema-Mismatch — leere Steps im Output, Test-Fixture maskiert den Bug), ISSUE-025 (Medium, F6 Self-hosted-Signed-URL erfordert apikey-Query-Param). **Naechster Schritt: Entscheidung F4-Fix-Variante (A=Mini-Slice SLC-039a empfohlen, B=in SLC-040 mit-fixen, C=als Known-Issue laufen lassen) bevor /backend SLC-040.**
- Current Phase: V4 Implementation — 7/8 Slices done (033, 034, 035, 036, 037, 038, 039). FEAT-022 + FEAT-024 + FEAT-025 done. 1 Slice verbleibend: SLC-040 (Handbuch-UI + Cockpit Foundation).

## Immediate Next Steps
1. **Commit + Push** der /qa SLC-039 Phase 2-Outputs: `docs(qa SLC-039): RPT-088 + ISSUE-024 + ISSUE-025` + `chore(qa): qa-handbook-smoke.mjs + Bundle + Stubs` + `docs: STATE + KNOWN_ISSUES`.
2. **F4-Fix-Entscheidung (User)** — Variante A (Mini-Slice SLC-039a, ~30min, empfohlen), B (in SLC-040), oder C (als Known-Issue). Vor /backend SLC-040.
3. **Falls A: SLC-039a Mini-Slice** — Renderer akzeptiert echtes SopStep-Schema (action/responsible/timeframe/success_criterion + dependencies), Fixture + 5 Renderer-Tests nachziehen, Re-Run Smoke + Mini-RPT-089 + Re-Deploy.
4. **/backend SLC-040** — Handbuch-UI + Cockpit Foundation. Letzter V4-Slice. **Pflicht-Gate: Nicht-Tech-User-Smoke-Test** (R17, SC-V4-5). **Note: ISSUE-025 Signed-URL-Apikey-Workaround (Host-Replace + apikey-Query) muss in `getHandbookDownloadUrl` Server-Action umgesetzt werden.**
5. **User Coolify-Deploy** SLC-037 + SLC-038 + SLC-039 (+ optional SLC-039a) zusammen. Post-Deploy: Worker-Boot-Log `[worker] handbook_snapshot_generation handler registered`, echte UI-Trigger-Validierung.
6. **Mobile-Viewport-Smoke fuer SLC-036** (deferred): wenn Zeit, im DevTools Mobile-Mode pruefen.
7. **/post-launch** fuer SLC-034 + SLC-036 nach 1-2 Tagen Produktivbetrieb (optional, low-risk).

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
