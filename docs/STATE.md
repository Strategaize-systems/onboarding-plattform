# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: final-check
- Current Focus: **V4.1 /final-check PASS 2026-04-29 (RPT-110) — READY fuer /go-live.** Alle 7 Audit-Dimensionen PASS. 3 unused `@ts-expect-error`-Direktiven gefixt (1 V4.1-Scope SLC-045 highlight-rehype-plugin.test.ts:24, 2 pre-existing SLC-035 action-helpers.test.ts:127+129). `tsc --noEmit` exit 0. `npm run build` exit 0 mit 51 Routes. `npm audit --omit=dev` 3 moderate (alle ISSUE-026 wontfix postcss-bundled, unveraendert seit V3.1). 0 Stubs/Secrets in V4.1-Files. Storage-RLS via Page-Level-Guards intakt (Service-Role-Bypass mit Auth/Role/Cross-Tenant-Gates gated). Keine neuen ENVs. MIG-028 in Production deployed (verifiziert via SSH). Demo-DB Test-Daten-Cleanup bereits 0/0 (kein Restmuell). Eine Low-Notiz: Next.js 16 `middleware`→`proxy`-Convention-Deprecation (BL-059 als V4.x-Cleanup-Vorschlag, nicht V4.1-blockierend). **Naechste Aktion: /go-live.**
- Current Phase: V4.1 /final-check abgeschlossen. Pending: /go-live (Release-Risk-Assessment + Rollback-Plan + GO/NO-GO) → /deploy V4.1 (User-Pflicht via Coolify) → /post-launch.

## Immediate Next Steps
1. **/go-live** — Release-Risk + Rollback-Plan + GO/NO-GO-Entscheidung. V4.1 ist additiv (block_review-Tabelle neu via MIG-028 bereits live, keine Schema-Aenderungen auf bestehenden Tabellen, keine ENV-Aenderungen). Rollback-Risk LOW.
2. **/deploy V4.1** — User-Pflicht via Coolify-UI nach /go-live-GO (`feedback_manual_deploy.md`).
3. **/post-launch** — 1-2 Tage nach Deploy, Live-Verhalten beobachten.
4. **V4.2-Backlog (zur Info):** BL-051..058 (Active-Section-Scroll-Spy, Copy-Permalink-Button, Loading-Skeleton, Cross-Snapshot-Suche, Mobile-Polish 375px h1-Wrap, Worker-TOC-Anchor, Umlaut-Konsistenz, h1-Hover-Anchor), Sidebar-Total-Pending-Badge, plus aus V4.1-Iter-Cycles 3 IMPs in Dev-System (IMP-211/212/213). Aus /final-check vorgeschlagen: **BL-059** Next.js 16 `middleware`→`proxy`-Convention-Migration.

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
