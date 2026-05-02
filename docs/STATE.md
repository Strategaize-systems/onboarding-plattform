# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: implementing
- Current Focus: **V4.3 SLC-053 done 2026-05-02 (RPT-134).** Tooling-Migrations abgeschlossen: `src/middleware.ts` → `src/proxy.ts` per `git mv` + Funktion `middleware()` → `proxy()` umbenannt (Next 16 Convention). ESLint-9 flat-config-Migration mit nativem `eslint-config-next@16.1.1` (kein FlatCompat noetig — Q-V4.3-J nativ). `package.json` `lint`-Script auf `eslint .` umgestellt. `.eslintrc.json` geloescht. BL-059 + BL-064 auf `done`. NEUER BL-068 angelegt fuer V4.4-Lint-Sweep: 7 Pre-existing react-hooks-Errors + 6 Warnings in V2-V4.2-Code wurden durch die Migration sichtbar gemacht (per R-V4.3-3-Mitigation Out-of-Scope V4.3, Folge-BL). 336/336 ENV-unabhaengige Vitest-Tests gruen, 0 Tests gebrochen durch proxy-Rename. TypeScript-Compile gruen. Keine middleware-Deprecation-Warning mehr im Build. V4.2 bleibt Last Stable. V4.3 1/6 Slices done.
- Current Phase: V4.3 SLC-053 done. Naechste Phase: /qa SLC-053 (Pflicht), dann /frontend SLC-051 (Reader-UX-Bundle).

## Immediate Next Steps
1. **/qa SLC-053** — Verifikation Pflicht-Gates: Auth-Flow funktioniert (proxy-Convention akzeptiert), keine middleware-Deprecation-Warning im Build, Lint-Tooling laeuft erfolgreich (Pre-existing-Findings als BL-068 abgespalten), V4.2-Regression-Smoke. Auf Coolify Deploy + Browser-Login-Smoke (lokal nicht moeglich ohne ENV).
2. **/frontend SLC-051** (Reader-UX-Bundle) — 6 Micro-Tasks: useScrollSpy + CopyPermalinkButton + ReaderLoadingSkeleton + Mobile-h1-Wrap + h1-Heading-Anchor-Hover. Browser-Smoke 1280×800 + 375×667 Pflicht (SC-V4.3-2).
3. **Implementation V4.3 in Reihenfolge (per DEC-062):** SLC-053 ✓ → SLC-051 → SLC-052 (Worker+Templates) → SLC-055 (UX-Findings) → SLC-056 (ADR + Spike) → SLC-054 (Cross-Search). Nach jedem Slice: /qa Pflicht.
4. **BL-067 Berater-Help-Review** parallel via direkten Editor-Workflow (5 Markdown-Files unter `src/content/help/`); kein Code-Slice noetig.
5. **Nach SLC-054:** Gesamt-V4.3-/qa, /final-check, /go-live, /deploy als REL-011.
6. **Nach V4.3-Release:** /compliance-Sprint fuer Privacy/Datenschutz/Impressum-Page (separater Track per D-SPLIT-Decision). BL-068 (Lint-Sweep) als V4.4 oder eigener Maintenance-Sprint.
5. **V4.2-Slices-Stand (RELEASED):** SLC-046..050 alle done+QA+deployed, Gesamt-V4.2 (RPT-127), Final-Check (RPT-128), Go-Live (RPT-129), Deploy (RPT-130).
6. **V4.3-Backlog-Stand (Maintenance-Sammelrelease):** 9 offene Items (BL-051..059), Start nach V4.2-Release. Neu zu adden: ADR fuer State-Maschinen-UPDATE-Pattern (Service-Role vs RLS-Policy) basierend auf ISSUE-031, plus Investigation Next 16 Turbopack-Layout-Inlining-Anomalie.

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
- V4.2 — 2026-05-01 — released (REL-010), Deploy-Commits `918377a` (Frontend) + `daf9dfd` (CRON_SECRET-ENV-Durchreichung). Self-Service-Onboarding: 5 Slices (SLC-046..050), 3 Features (FEAT-031 Wizard + FEAT-032 Reminders + FEAT-033 In-App-Hilfe), 1 Migration (MIG-029 deployed 2026-04-29). Coolify-Scheduled-Task `capture-reminders-daily` aktiv (`0 9 * * *` Europe/Berlin) — erster Live-Run 2026-05-01 08:14 hat stage1-Reminder an richard@bellaerts.de gesendet, User-bestaetigt Inbox (DKIM-Alignment via IONOS-Default OK). Idempotenz live verifiziert (`skipped_already_sent: 1`). Gesamt-/qa LIVE PASS (RPT-127), Final-Check (RPT-128), Go-Live CONDITIONAL GO (RPT-129), Deploy LIVE PASS (RPT-130). 0 High Risks, 2 Medium V4-Pre-existing (ISSUE-021/022), 5 Low. ISSUE-032 (DKIM) als FALSE-POSITIVE resolved (IONOS provider-spezifische Selektoren), IMP-246 erfasst. Post-Launch-Window 18h startet 12:00 Europe/Berlin.
- V4.1 — 2026-04-29 — released (REL-009), Deploy-Commit `ec311a7`. **Post-Launch STABLE 2026-04-30 (RPT-117, ~18h)**: 0 Errors, alle Routes reachable, Container 18h healthy, kein Hotfix. Handbuch-Reader + Berater-Review-Workflow: 5 Slices (SLC-041..045), 3 Features (FEAT-028..030), 1 Migration (MIG-028 = Migration 079, bereits 2026-04-28 deployed). Reader unter `/dashboard/handbook[/<id>]`, Berater-Review unter `/admin/reviews` + `/admin/blocks/<key>/review` + `/admin/tenants/<id>/reviews`, Cockpit-Card "Mitarbeiter-Bloecke reviewed". Worker-Pre-Filter mit Best-Effort-Backfill (DEC-048). 8 V4.1-DECs (DEC-043..050). 378/378 Vitest-PASS auf Coolify-DB, Final-Check (RPT-110) + Go-Live (RPT-111) PASS. Browser-Smoke 17/17 user-bestaetigt. Post-Deploy HTTP 307 Login-Redirect TTFB 102ms. 0 V4.1-Blocker. 4 akzeptierte Pre-V4.1-Residual-Risks (ISSUE-007/021/022/026/028).
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
