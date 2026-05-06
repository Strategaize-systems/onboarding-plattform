# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: implementing
- Current Focus: **SLC-071 QA Final-Gate code-side PASS (RPT-169) — bereit für Merge + Coolify-Redeploy + Browser-Smoke.** MT-9 als kombinierter QA-Gate durchgezogen: Stub-Scan clean, Lint 0/0, SLC-071-Vitest 9/9 GREEN (6 actions + 3 capture-logic), Build PASS (mit Dummy-ENV), 4-Rollen RLS-Partial-Matrix 4/4 GREEN gegen Live-Coolify-DB via node:20-Container, Schema-Live-Verify alle 3 Migrations + 6 Policies + Bucket korrekt deployed. Wiring-Chain (Capture-UI → Server Action → walkthrough_session → Status-Polling → /api/walkthroughs/[id]/status) komplett verbunden, keine Stubs. Branch `slc-071/v5-walkthrough-foundation` Commit `d3137ea` (1a16d7e + neue v5-walkthrough-rls.test.ts). 14/15 ACs PASS code-side; AC-10/11/12 (Browser-Smoke + Auto-Stop + Status-Polling-Live) pending Coolify-Redeploy. Findings: 1 Low (AC-4 Idempotenz-Pattern verifiziert, aktiver Re-Apply nicht erneut durchgeführt — Pattern ist Standard im Repo). Naechste Schritte: User-merge + Coolify-Redeploy + Browser-Smoke + Slice-Closing (slices/INDEX SLC-071 → done) → /backend SLC-072 Worker.
- Current Phase: V5 Implementation (Walkthrough-Mode MVP, 1/4 Slices code-complete + code-side QA-PASS, Browser-Smoke + Slice-Closing pending).

## Immediate Next Steps
1. **User: Merge `slc-071/v5-walkthrough-foundation` (Commit d3137ea) → main + Push.**
2. **User: Coolify-Redeploy (manuell ueber UI per `feedback_manual_deploy`).**
3. **AC-10 Browser-Smoke (Chrome + Edge)** auf `https://onboarding.strategaizetransition.com/employee/capture/walkthrough/<valid-capture-session-id>`: Permission-Prompts (getDisplayMedia + getUserMedia), Aufnahme, Stopp, Upload-Progress-Bar, Redirect zur Status-Page (`/employee/walkthroughs/[id]`).
4. **AC-11 Auto-Stop-Test (verkuerzt 1min via ENV)** — erfordert kleinen Code-Touch: `WALKTHROUGH_AUTO_STOP_MS` aus ENV `WALKTHROUGH_AUTO_STOP_MS` lesbar machen (heute hardcoded in `walkthrough-capture-logic.ts:10`). Bewusst klein gehalten — minimaler Patch + Test + Revert.
5. **AC-12 Status-Polling-Live** — direkt nach Upload: `uploaded` als Initial-State sichtbar (Polling alle 5s); `transcribing → pending_review` folgt erst mit SLC-072-Worker.
6. **Slice-Closing nach Browser-Smoke** — slices/INDEX.md SLC-071 → `done`, planning/backlog.json synchen, RPT-170 (Browser-Smoke-Bericht), Closing-Commit.
7. **/backend SLC-072 Worker `walkthrough_transcribe`** — 5 MTs, Whisper-Adapter-Reuse, ffmpeg, KU-Persistierung, Status-Maschine `uploaded → transcribing → pending_review`.
8. **BL-076 Cron-Idempotenz-Hotfix** zwischen SLC-073 und SLC-074 (nicht jetzt vorziehen).
9. **BL-067 Berater-Help-Review** parallel via direkten Editor-Workflow.

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
- V4.4 — 2026-05-05 — released (REL-012), Deploy-Commit `9be520b`, Image-Tag `bwkg80w04wgccos48gcws8cs_app:9be520b685788ecdd23a784c4c32bb483e88736c`. Maintenance-Sammelrelease: 2 Slices (SLC-061 Lint-Sweep 7E+6W → 0/0 + SLC-062 SQL-Backfill MIG-030 Demo-Template-Umlauten), 4 V4.4-DECs (DEC-070..073). MIG-030 (Migration 081) bereits live appliziert (RPT-156 in /backend SLC-062, idempotent, Pre-Apply-Backup `/opt/onboarding-plattform-backups/pre-mig-030_20260505_131019.csv`). Gesamt-/qa PASS (RPT-158), Final-Check READY (RPT-159), Go-Live GO (RPT-160), Deploy RELEASED (RPT-161). Live-Smoke 5/5 PASS: app+worker Up `(healthy)` 1min nach Redeploy, `/login` HTTP 200 TTFB 97.6ms (V4.3-Vergleichsbasis: 107ms), `/api/health` `{"status":"ok"}`, 0 FATAL/ERROR/Crash, Worker-Bedrock-ENV korrekt geladen. 0 V4.4-eingefuehrte Risks. 1 Medium pre-existing (ISSUE-026 postcss bundled in next, akzeptiert). 4 Low pre-existing (9 dev-only npm-vulns, 120 console.* in workers + libs, 5 offene V1-V4.1-Issues, BL-067 deferred parallel). Pre-Production-Compliance-Gate aufgeschoben — V4.4 bleibt Internal-Test-Mode.
- V4.3 — 2026-05-05 — released (REL-011), Deploy-Commit `77b3852` (HEAD-Snapshot, App-Code-State identisch zu `0843362`). Maintenance-Sammelrelease: 6 Slices (SLC-051..056), 9 V4.3-DECs (DEC-062..069). Keine Schema-Migration, keine neuen Container, keine neuen Cron-Jobs. SLC-051 Reader-UX-Bundle (Scroll-Spy + Permalink + Skeleton + Mobile-h1 + h1-Anchor-Hover), SLC-052 Worker+Templates-Hygiene (slugifyHeading + In-App-Anchor-TOC + Umlaut-Konsistenz), SLC-053 Tooling-Migrations (middleware→proxy + ESLint-9 flat-config), SLC-054 Cross-Snapshot-Suche client-side + localStorage-History, SLC-055 UX-Findings-Bundle (Help-Konsolidierung 3-Tab-Sheet + Tooltip-Card-Header-Wrapper), SLC-056 ADR State-Maschinen-Pattern + Spike Turbopack-Layout-Inlining. Bundle-Live-Smoke (RPT-146) auf Strategaize-Business-Case-Fixture PASS, Gesamt-/qa (RPT-147), Final-Check (RPT-148), Go-Live (RPT-149), Deploy (RPT-150). Live-Smoke alle 6 Server-Checks PASS (TTFB 107ms, Health OK, 0 Errors). 0 V4.3-eingefuehrte Risks. 1 Medium Pre-V4.2-carry-over (ISSUE-034 wizard-actions.test.ts Mock-Drift, Live-Code unbetroffen). 7 Low residual (alle dokumentiert). Pre-Production-Compliance-Gate aufgeschoben — V4.3 bleibt Internal-Test-Mode bis Cutover.
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
