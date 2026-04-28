# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: qa
- Current Focus: **V4.1 SLC-044 /qa MIXED 2026-04-28 (RPT-104).** Alle automatisierten Pruefungen PASS: Stub-Detection 0 Hits, `npm run build` gruen mit beiden Reader-Routes als Dynamic, Coolify-DB-Tests **360/360 PASS in 2.89s** (35 Test-Files inkl. 46/46 v4-perimeter-matrix-RLS + 12/12 block-review-rls + 7/7 SLC-042 get-review-summary), Wiring-Chain strukturell PASS, AC-14 SLC-041 Worker-metadata-Counter LIVE verifiziert (3 Snapshots vom 28.04. mit `{pending,approved,rejected}_blocks`-Feldern; alte Pre-SLC-041-Snapshots mit `{}`-metadata), Storage-Bucket-ZIP-Konvention `{tenant_id}/{snapshot_id}.zip` bestaetigt (3 ZIP-Files), Template handbook_schema-Lookup PASS (8 Sections in "Exit-Readiness"). **AC-16 Pflicht-Browser-Smoke mit Nicht-Tech-User-Persona offen — User-Pflicht-Gate.** Smoke-Plan in RPT-104 dokumentiert (10 Smoke-Punkte inkl. Stale-Banner-Test mit SQL-Variante, Cross-Link-Visibility-Test in 2 Browser-Sessions, Responsive 375/768/1024). SLC-044 bleibt `in_progress` bis User-Smoke PASS.
- Current Phase: V4.1 Implementation — SLC-041+042 done, SLC-044 /qa MIXED (User-Smoke offen). Naechste Schritte: User fuehrt Browser-Smoke durch + RPT-104 finalisieren ODER parallel /frontend SLC-043 (unabhaengig).

## Immediate Next Steps
1. **User fuehrt Browser-Smoke fuer SLC-044 durch (Pflicht-Gate AC-16, R17 analog SC-V4-5).** Smoke-Plan steht in RPT-104. 10 Smoke-Punkte: Sidebar-Klick → Snapshot-Auswahl, Snapshot oeffnen → Reader laedt, Sidebar-Section-Click → Scroll, Heading-Anchor-Click, Snapshot-Wechsel, Cross-Link-Visibility (DOM-Pruefung tenant_admin vs. strategaize_admin), Stale-Banner-Test (Variante A real-Block-Submit oder Variante B Mock-Checkpoint-SQL), Responsive 375/768/1024, Bridge-Konsolidierungs-Sicht, Empty-State (optional). **Pflicht-Voraussetzung: Production-Stand `c6e929a` deployed (Coolify-Manual-Deploy).**
2. **Bei PASS:** RPT-104 status → completed, slices/INDEX SLC-044 → done, STATE update, dann /frontend SLC-043 oder /frontend SLC-045.
3. **Bei FAIL:** Iter-Loop analog SLC-042 (RPT-102 Pattern) — Bug-Fix → Coolify-Redeploy → Smoke-Re-Run.
4. **/frontend SLC-043 (parallel-faehig zu Smoke)** — Cross-Tenant + Pro-Tenant Reviews + Quick-Stats-Badge. AC-12 Linkziel `/admin/tenants/[id]/reviews` existiert heute noch nicht (404). Komplett unabhaengig von SLC-044, kann sofort starten.
5. **/frontend SLC-045** — Reader Volltext-Suche + Performance-Warning + Polish (nach SLC-044-PASS).
6. **Gesamt-V4.1-/qa** → /final-check → /go-live → /deploy nach allen 5 Slices.
7. **Optional jetzt: Test-Daten cleanen** — 3 employee_questionnaire-KUs in Demo-Tenant Session 22234f9e-... (Marker `QA-SMOKE-RPT-102`) plus 3 block_review-Rows. Cleanup-SQL in RPT-102 dokumentiert.
8. **/post-launch V4** — verschoben auf nach V4.1-Release.
9. **V4.2** spaeter: BL-048 Tenant Self-Service Onboarding + Component-Test-Setup (jsdom + @testing-library/react). Plus mind. 2 V4.2-Polish-Items aus SLC-044 Open Points: (a) Cockpit-MetricCard "Unternehmerhandbuch" Reader-Umlenkung fuer tenant_admin, (b) Pre-existing TS-Errors in `bridge/__tests__/action-helpers.test.ts:127,129` Cleanup.

## Active Scope
**V4 — Zwei-Ebenen-Verschmelzung, 6 Features Code-done, 8 Slices Code-done:**
- FEAT-022 Employee Role + RBAC Extension — SLC-033 + SLC-034 + SLC-037 (done)
- FEAT-023 Blueprint-to-Employee Bridge Engine — SLC-035 + SLC-036 (deployed)
- FEAT-024 Employee Capture Workflow — SLC-037 (done)
- FEAT-025 Capture-Mode Extension Hooks — SLC-038 walkthrough_stub Spike (done)
- FEAT-026 Unternehmerhandbuch Foundation — SLC-039 + SLC-039a + SLC-040 (done, awaiting deploy)
- FEAT-027 Self-Service Status Cockpit Foundation — SLC-040 (done, awaiting deploy)

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
- V4 — 2026-04-27 — released (REL-008), Deploy-Commit `d2be0e4` (Compose-Drift-Fix + V4 konsolidiert). Zwei-Ebenen-Verschmelzung: 8 Slices (SLC-033..040), 6 Features (FEAT-022..027), 14 Migrationen (065-078). Geschaeftsfuehrer-Blueprint + Mitarbeiter-Capture + Bridge-Engine + Unternehmerhandbuch-Foundation + Self-Service-Cockpit. Pflicht-Gates SC-V4-3 (4-Rollen-RLS-Matrix 46/46 PASS gegen Live-DB), SC-V4-5 (Nicht-Tech-User-Smoke), SC-V4-6 (Capture-Mode-Hooks-Spike). 322/322 Tests gruen, 0 Blocker, 2 Low residual (ISSUE-026 postcss bundled, ISSUE-028 V3 RECORDING_WEBHOOK_SECRET — keiner V4-relevant). Coolify-Live-Smoke PASS, Browser-Smoke User-Self-Test PASS in 5/5 Pfaden. Demo-Tenant Live-Daten: 5 KUs + 2 Bridge-Runs + 6 Proposals + 1 Invitation accepted + 4 Snapshots ready.
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
