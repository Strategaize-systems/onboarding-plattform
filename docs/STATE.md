# STATE

## Project
- Name: Strategaize Onboarding-Plattform
- Repository: strategaize-onboarding-plattform
- Delivery Mode: SaaS

## Purpose
Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Ermoeglicht mehrere Capture-Modi (Fragebogen, Meeting, Voice, etc.) und Template-basierte Produktvarianten (z.B. Exit-Readiness, Immobilien-Onboarding). Ab V4: Zwei-Ebenen-Verschmelzung (GF-Blueprint + Mitarbeiter-Capture + Unternehmerhandbuch-Output).

## Current State
- High-Level State: implementing
- Current Focus: **V4.1 SLC-045 /qa strukturell PASS 2026-04-29 (RPT-106) — User-Pflicht-Browser-Smoke offen.** Reader Volltext-Suche + Performance-Warning + Polish strukturell verifiziert: 0 Stub-Hits, lokaler Production-Build gruen, **378/378 Vitest-Tests PASS auf Coolify-DB** (Container `supabase-db-bwkg80w04wgccos48gcws8cs-073211108966`, +18 vs RPT-104 = 11 search.ts + 7 highlight-rehype-plugin.ts). Wiring-Chain SearchInput→State→memo searchResults→Plugin→DOM-mark→handleJumpToMatch+Pulse strukturell PASS. Performance-Banner-Logik via Code-Path + Unit-Tests verifiziert; Live-Trigger nicht moeglich (alle 5 Demo-Snapshots ~5KB, weit unter 500KB). 11/12 ACs strukturell PASS, AC-6 (Performance live) + AC-7 (Banner live mit padded Snapshot) + AC-12 (Responsive) als USER-PFLICHT-BROWSER-SMOKE offen. 3 Low-Severity-Findings reviewed (Indigo-500-Heading-Anchor, UTF-16-vs-Bytes, `match-__index-N`-Cosmetic), kein Blocker. **Naechste Aktion: Browser-Smoke-Plan in RPT-106 durchgehen.**
- Current Phase: V4.1 Implementation — SLC-041+042+044 done + SLC-045 strukturell PASS (User-Smoke offen), 1 Slice offen (SLC-043). Anschliessend Gesamt-V4.1-/qa → /final-check → /go-live → /deploy.

## Immediate Next Steps
1. **User-Pflicht-Browser-Smoke SLC-045** (per RPT-106 Plan) — 7 Smoke-Punkte: SearchInput sichtbar + Counter (AC-1+3), Treffer-Liste + Klick-zu-Match + Pulse (AC-4), Performance-Banner mit padded Snapshot (AC-7), Reset+Esc (AC-5), Polish-Items Heading-Anchor-Hover + Ctrl/Cmd+F + Print-CSS (AC-10), Responsive 375/768/1024 (AC-12), Suche-Performance-Wahrnehmung (AC-6). Bei PASS: SLC-045 Status `done`, dann /frontend SLC-043.
2. **/frontend SLC-043** — Cross-Tenant + Pro-Tenant Reviews + Quick-Stats-Badge. Komplett unabhaengig vom Reader. Kann auch parallel zum SLC-045 Browser-Smoke laufen. Linkziel `/admin/tenants/[id]/reviews` existiert heute noch nicht (404). Pflicht-Gate: 4-Rollen-RLS-Check.
3. **Gesamt-V4.1-/qa** nach SLC-043 + SLC-045 done — SC-V4.1-1..12 vollstaendig verifizieren.
4. **/final-check → /go-live → /deploy V4.1** anschliessend.
5. **Optional vorab: Test-Daten cleanen** — 3 employee_questionnaire-KUs in Demo-Tenant Session 22234f9e-... (Marker `QA-SMOKE-RPT-102`) plus 3 block_review-Rows. Cleanup-SQL in RPT-102 dokumentiert.
6. **/post-launch V4** — verschoben auf nach V4.1-Release.
7. **V4.2** spaeter: BL-048 Tenant Self-Service Onboarding + Component-Test-Setup (jsdom + @testing-library/react). Reader-Polish-Items: BL-051 Active-Section-Scroll-Spy, BL-052 Copy-Permalink-Button, BL-053 Loading-Skeleton, BL-054 Cross-Snapshot-Suche. Plus aus SLC-044 Open Points: Cockpit-MetricCard "Unternehmerhandbuch" Reader-Umlenkung fuer tenant_admin + Pre-existing TS-Errors in `bridge/__tests__/action-helpers.test.ts:127,129`.

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
