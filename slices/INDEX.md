# Slice Index

## V1 Slices

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-001 | [Schema-Fundament](SLC-001-schema-fundament.md) | FEAT-001 | done | Blocker | 2026-04-14 |
| SLC-002 | [Rollen-Umbenennung tenant_owner → tenant_admin](SLC-002-rollen-umbenennung.md) | FEAT-001 | done | Blocker | 2026-04-14 |
| SLC-002a | [Test-Infrastruktur + RLS-Isolationstest](SLC-002a-test-infrastruktur.md) | FEAT-001 | done | Blocker | 2026-04-15 |
| SLC-002b | [strategaize_admin + Demo-Tenant Seed](SLC-002b-admin-seed.md) | FEAT-001 | done | High | 2026-04-15 |
| SLC-002c | [App-Branding Onboarding-Plattform](SLC-002c-app-branding.md) | FEAT-001 | done | Medium | 2026-04-15 |
| SLC-002d | [Blueprint-Legacy-UI-Cleanup](SLC-002d-legacy-ui-cleanup.md) | FEAT-001 | done | Medium | 2026-04-16 |
| SLC-003 | [Template + Exit-Readiness-Content](SLC-003-template-exit-readiness.md) | FEAT-002 | done | High | 2026-04-14 |
| SLC-004 | [Capture-Session-Start + Block-Listing](SLC-004-capture-session-start.md) | FEAT-003 | done | High | 2026-04-14 |
| SLC-005 | [Questionnaire-UI-Portierung](SLC-005-questionnaire-ui.md) | FEAT-003 | done | High | 2026-04-14 |
| SLC-006 | [Block-Submit + Checkpoint](SLC-006-block-submit-checkpoint.md) | FEAT-003 | done | High | 2026-04-14 |
| SLC-007 | [Exception-Mode-Layer](SLC-007-exception-mode.md) | FEAT-004 | reverted | Medium | 2026-04-14 |
| SLC-008 | [Worker-Container + Verdichtung + Blueprint Chat-Flow](SLC-008-worker-container.md) | FEAT-005 | done | Blocker | 2026-04-14 |
| SLC-009 | [Debrief-UI + KU-Editor](SLC-009-debrief-ui.md) | FEAT-006 | done | High | 2026-04-14 |
| SLC-010 | [Meeting-Snapshot + JSON-Export](SLC-010-meeting-snapshot-export.md) | FEAT-006 | done | High | 2026-04-14 |

## V1.1 Slices (Maintenance)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-011 | [Blueprint-Legacy-Cleanup](SLC-011-legacy-cleanup.md) | FEAT-007 | done | High | 2026-04-18 |
| SLC-012 | [Dashboard + Error-Logging](SLC-012-dashboard-errorlog.md) | FEAT-008, FEAT-009 | done | High | 2026-04-18 |

## V2 Slices (Intelligence Upgrade + Evidence + Template-Expansion)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-013 | [Orchestrator-Integration](SLC-013-orchestrator-integration.md) | FEAT-010 | done | Blocker | 2026-04-19 |
| SLC-014 | [Gap-Question-Schema + Backspelling-Backend](SLC-014-gap-question-backend.md) | FEAT-010, FEAT-011 | done | Blocker | 2026-04-19 |
| SLC-015 | [Backspelling-UI](SLC-015-backspelling-ui.md) | FEAT-011 | done | High | 2026-04-19 |
| SLC-016 | [SOP-Schema + Generation](SLC-016-sop-backend.md) | FEAT-012 | done | High | 2026-04-19 |
| SLC-017 | [SOP-UI](SLC-017-sop-ui.md) | FEAT-012 | done | High | 2026-04-19 |
| SLC-018 | [Evidence-Schema + Storage](SLC-018-evidence-schema-storage.md) | FEAT-013 | done | High | 2026-04-19 |
| SLC-019 | [Evidence-Extraction + Mapping](SLC-019-evidence-extraction-mapping.md) | FEAT-013 | done | High | 2026-04-19 |
| SLC-020 | [Evidence-UI](SLC-020-evidence-ui.md) | FEAT-013 | done | High | 2026-04-19 |
| SLC-021 | [Template-Erweiterung + Demo-Template](SLC-021-template-switcher.md) | FEAT-014 | done | Medium | 2026-04-19 |
| SLC-022 | [Whisper-Adapter + Voice-Input](SLC-022-whisper-voice-input.md) | FEAT-015 | done | Medium | 2026-04-19 |
| SLC-023 | [Diagnose-Backend](SLC-023-diagnosis-backend.md) | FEAT-016 | done | Blocker | 2026-04-19 |
| SLC-024 | [Diagnose-Frontend + SOP-Gate](SLC-024-diagnosis-frontend.md) | FEAT-016 | done | Blocker | 2026-04-19 |

## Execution Order Notes

- **SLC-001** ist Code+Schema+Deploy `done` (RPT-006 Mixed: Test-Coverage in SLC-002a nachgeholt — Status hier bewusst auf `done` gehoben, Gap wird nicht mehr als in_progress gezaehlt).
- **Reihenfolge-Grund:** SLC-002 kommt vor 002a, weil 002a den neuen Rollen-Namen bereits voraussetzt. 002b kommt nach 002a, damit der Seed sofort gegen die Test-Infra verifiziert werden kann. 002c kann parallel oder zwischendrin laufen. 002d wurde beim Login-Smoketest nach SLC-002b entdeckt (Blueprint-Legacy-Profile-Flow verweist auf entfernte `owner_profiles`-Tabelle, ISSUE-009) und sollte vor SLC-003 laufen, damit die Owner-Profile-UI den Template-Flow nicht torpediert.
- **Vor SLC-005** muss SLC-002a durch sein — SaaS-TDD-Mandat.

### V2 Execution Order
- **SLC-013 → SLC-014 → SLC-015:** Orchestrator → Backspelling-Backend → Backspelling-UI (strikt sequentiell, jeder baut auf dem vorherigen auf)
- **SLC-016 → SLC-017:** SOP-Backend → SOP-UI (SLC-016 kann parallel zu SLC-014 laufen, braucht nur SLC-013)
- **SLC-018 → SLC-019 → SLC-020:** Evidence-Infra → Extraktion → UI (strikt sequentiell, aber unabhaengig von Orchestrator-Kette)
- **SLC-021:** Template-Erweiterung (braucht SLC-016 MT-2 fuer template.sop_prompt Spalte, kann sonst parallel)
- **SLC-022:** Whisper (komplett unabhaengig, kann jederzeit laufen)
- **Empfohlene Reihenfolge:** 013 → 014 → 015 → 016 → 017 → **023 → 024** → 018 → 019 → 020 → 021 → 022
- **SLC-023 + SLC-024 (Diagnose-Layer)** sind Prioritaet 1 nach SLC-017 (SOP). Diagnose ist Kernprodukt-Feature und SOP-Gate-Abhaengigkeit.
- **Parallelisierbar:** SLC-018..020 (Evidence) kann parallel zu SLC-023..024 laufen. SLC-022 (Whisper) kann jederzeit eingeschoben werden.

## V3 Slices (Dialogue-Mode)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-025 | [Jitsi Infrastructure](SLC-025-jitsi-infrastructure.md) | FEAT-017 | done | Blocker | 2026-04-21 |
| SLC-026 | [Meeting Guide Backend](SLC-026-meeting-guide-backend.md) | FEAT-018 | done | High | 2026-04-21 |
| SLC-027 | [Meeting Guide UI](SLC-027-meeting-guide-ui.md) | FEAT-018 | done | High | 2026-04-21 |
| SLC-028 | [Dialogue Session Backend](SLC-028-dialogue-session-backend.md) | FEAT-019 | done | High | 2026-04-21 |
| SLC-029 | [Dialogue Session UI](SLC-029-dialogue-session-ui.md) | FEAT-019 | done | High | 2026-04-21 |
| SLC-030 | [Recording Pipeline](SLC-030-recording-pipeline.md) | FEAT-020 | done | Blocker | 2026-04-21 |
| SLC-031 | [Dialogue Extraction](SLC-031-dialogue-extraction.md) | FEAT-020 | done | Blocker | 2026-04-21 |
| SLC-032 | [Pipeline Integration + Debrief](SLC-032-pipeline-integration.md) | FEAT-021 | done | High | 2026-04-21 |

### V3 Execution Order
- **SLC-025:** Jitsi-Infra (Blocker fuer alles)
- **SLC-026 → SLC-027:** Meeting Guide Backend → UI (sequentiell)
- **SLC-028 → SLC-029:** Dialogue Session Backend → UI (sequentiell, braucht SLC-025 + SLC-026)
- **SLC-030:** Recording Pipeline (braucht SLC-025 + SLC-028)
- **SLC-031:** Dialogue Extraction (braucht SLC-030 + SLC-026)
- **SLC-032:** Pipeline Integration (braucht SLC-031 + SLC-027 + SLC-029)
- **Parallelisierbar:** SLC-026+027 kann parallel zu SLC-028+029 laufen (beide brauchen nur SLC-025). SLC-030+031 sind strikt sequentiell.

## V4 Slices (Zwei-Ebenen-Verschmelzung)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-033 | [V4 Schema-Fundament](SLC-033-v4-schema-fundament.md) | FEAT-022 | done | Blocker | 2026-04-24 |
| SLC-034 | [Employee-Auth + Invitation-Flow](SLC-034-employee-auth-invitation.md) | FEAT-022 | done | Blocker | 2026-04-24 |
| SLC-035 | [Bridge-Engine Backend](SLC-035-bridge-engine-backend.md) | FEAT-023 | done | High | 2026-04-24 |
| SLC-036 | [Bridge-Review-UI](SLC-036-bridge-review-ui.md) | FEAT-023 | done | High | 2026-04-24 |
| SLC-037 | [Employee Capture-UI + Sicht-Perimeter](SLC-037-employee-capture-ui.md) | FEAT-022, FEAT-024 | done | Blocker | 2026-04-24 |
| SLC-038 | [Capture-Mode-Hooks Spike](SLC-038-capture-mode-hooks-spike.md) | FEAT-025 | done | Medium | 2026-04-24 |
| SLC-039 | [Handbuch-Snapshot Backend](SLC-039-handbuch-snapshot-backend.md) | FEAT-026 | done | High | 2026-04-24 |
| SLC-040 | [Handbuch-UI + Cockpit Foundation](SLC-040-handbuch-ui-cockpit.md) | FEAT-026, FEAT-027 | done | High | 2026-04-24 |

### V4 Execution Order
- **SLC-033:** V4 Schema-Fundament (Migrations 065-071 + 075, RLS-Test-Matrix-Skelett) — Blocker fuer alle weiteren V4-Slices.
- **SLC-034:** Employee-Auth (Migration 072 + Invitation-UI + /accept-invitation + /employee Skelett) — braucht SLC-033.
- **SLC-035 → SLC-036:** Bridge-Backend (Migration 073 + Worker) → Bridge-Review-UI — strikt sequentiell.
- **SLC-037:** Employee Capture-UI + vollstaendige 4×8 RLS-Test-Matrix — braucht SLC-033 + SLC-034 + SLC-036. **RLS-Matrix-Gruen-Gate.**
- **SLC-038:** Capture-Mode-Hooks Spike (walkthrough_stub) — braucht SLC-037 (Registry-Etablierung). Low-Risk, kann parallel zu SLC-039 laufen.
- **SLC-039:** Handbuch-Backend (Migration 074 + Worker + ZIP-Builder) — braucht SLC-037 (employee-KUs).
- **SLC-040:** Handbuch-UI + Cockpit + **Nicht-Tech-User-Smoke-Test** — letzter V4-Slice, braucht SLC-039.

**Parallelisierbar:**
- SLC-038 kann parallel zu SLC-039 laufen, sobald SLC-037 done ist.
- Alle anderen Ketten strikt sequentiell (Schema-Fundament-Blocker, RLS-Gruen-Gate).

**Pflicht-Gates fuer V4:**
- SLC-033 + SLC-037: 4×8 RLS-Test-Matrix (32 Pflicht-Faelle, vollstaendig gruen am Ende von SLC-037).
- SLC-038: SC-V4-6-Beweis (neuer Mode ohne Migration eingefuehrt).
- SLC-040: Nicht-Tech-User-Smoke-Test (R17, SC-V4-5).

## V4.1 Slices (Handbuch-Reader + Berater-Review-Workflow)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-041 | [Block-Review Backend + Worker-Pre-Filter](SLC-041-block-review-backend.md) | FEAT-029 | done | Blocker | 2026-04-28 |
| SLC-042 | [Konsolidierter Review-View + Trigger-Quality-Gate + Cockpit-Card](SLC-042-review-view-trigger-cockpit.md) | FEAT-029 | done | High | 2026-04-28 |
| SLC-043 | [Cross-Tenant + Pro-Tenant Reviews + Quick-Stats-Badge](SLC-043-cross-tenant-reviews.md) | FEAT-030 | done | Medium | 2026-04-28 |
| SLC-044 | [Handbuch-Reader + Markdown-Stack + Sidebar-Nav + Snapshot-Liste](SLC-044-handbuch-reader.md) | FEAT-028 | done | High | 2026-04-28 |
| SLC-045 | [Reader Volltext-Suche + Performance-Warning + Polish](SLC-045-reader-search-and-warnings.md) | FEAT-028 | done | Medium | 2026-04-28 |

### V4.1 Execution Order
- **SLC-041** (Backend-Foundation): MIG-028 + RLS + Worker-Pre-Filter + Server-Actions. **Blocker fuer alle V4.1-Frontend-Slices.** Pflicht-Gates: 4-Rollen-RLS-Matrix erweitert um `block_review` (mind. 8 Test-Faelle, gruen gegen Live-DB), Worker-Backwards-Compat-Test (alte V4-Snapshots reproduzierbar).
- **SLC-042** (Frontend Review-Workflow): Konsolidierter Review-View + Trigger-Confirm-Dialog + Cockpit-Card. Braucht SLC-041.
- **SLC-043** (Frontend Berater-Visibility): Cross-Tenant + Pro-Tenant Reviews-Sichten + Quick-Stats-Badge. Braucht SLC-041; profitiert von SLC-042 (Link-Ziele, sonst 404 in Zwischenzeit).
- **SLC-044** (Frontend Reader): Handbuch-Reader-Page + Markdown-Stack + Sidebar-Nav + Snapshot-Liste. Braucht V4 SLC-039/040 done; profitiert von SLC-041 (block_review_summary in snapshot.metadata) und SLC-042 (Cockpit-Card-Link). **Pflicht-Gate: Browser-Smoke-Test mit Nicht-Tech-User-Persona** (R17 analog SC-V4-5).
- **SLC-045** (Frontend Reader-Polish): Volltext-Suche + Performance-Warning + Polish-Items aus SLC-044 Smoke-Test-Feedback. Braucht SLC-044 done.

**Empfohlene Reihenfolge:** 041 → 042 → 043 ∥ 044 → 045 → Gesamt-V4.1-/qa.

**Parallelisierbar:**
- SLC-043 und SLC-044 koennen parallel laufen sobald SLC-042 done (oder sogar parallel zu SLC-042 wenn Cockpit-Card-Link-Stub akzeptiert wird).
- SLC-041 → SLC-042 → SLC-044 ist die kritische Kette (Cockpit-Card in 042 nutzt getReviewSummary aus 041; Reader in 044 nutzt block_review_summary aus 041).

**Pflicht-Gates fuer V4.1:**
- SLC-041: 4-Rollen-RLS-Matrix-Erweiterung um `block_review` (mind. 8 Test-Faelle, 100% PASS gegen Live-DB).
- SLC-041: Worker-Backwards-Compat-Test (alte V4-Snapshots ohne `block_review`-Daten weiter generierbar).
- SLC-044: Browser-Smoke-Test mit Nicht-Tech-User-Persona (analog SC-V4-5).
- Gesamt-V4.1-/qa nach SLC-045 (SC-V4.1-1..12 vollstaendig verifiziert).

## V4.2 Slices (Tenant Self-Service Onboarding)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-046 | [Wizard Backend-Foundation + MIG-029](SLC-046-wizard-backend-foundation.md) | FEAT-031 | done | Blocker | 2026-04-29 |
| SLC-047 | [Wizard-Modal Frontend (4 Steps + Skip + Auto-Trigger)](SLC-047-wizard-modal-frontend.md) | FEAT-031 | done | High | 2026-04-29 |
| SLC-048 | [Capture-Reminders Backend (Cron + SMTP + Unsubscribe)](SLC-048-reminders-cron-backend.md) | FEAT-032 | done | High | 2026-04-29 |
| SLC-049 | [Cockpit-Card + Mitarbeiter-Filter + Opt-Out-Toggle](SLC-049-cockpit-card-filter-optout.md) | FEAT-032 | done | Medium | 2026-04-29 |
| SLC-050 | [Help-Sheet + 5 Markdown-Files + 5 Tooltips](SLC-050-help-sheet-tooltips.md) | FEAT-033 | done | Medium | 2026-04-29 |

### V4.2 Execution Order
- **SLC-046** (Backend-Foundation, Blocker): MIG-029 atomare 3-Block-Migration (tenants ALTER + reminder_log + user_settings) + Wizard-Server-Actions + Layout-Helper. **Blocker fuer alle V4.2-Slices** weil das Schema fuer reminder_log und user_settings hier schon live geht (Variante A aus /architecture V4.2). Pflicht-Gates: 4-Rollen-RLS-Matrix-Erweiterung (16 Test-Faelle), Multi-Admin-Lock-Race-Test, Trigger-Soft-Fail-Test, Migration-Live-Deploy auf Hetzner.
- **SLC-047** (Frontend Wizard): Wizard-Modal mit 4 Step-Komponenten + Skip-Logic + Auto-Trigger im Layout. Braucht SLC-046. Pflicht-Gate: Browser-Smoke mit Nicht-Tech-User-Persona (SC-V4.2-9).
- **SLC-048** (Backend Reminders): Cron-Endpoint + workdaysSince + sendReminder + Unsubscribe-Endpoint. Schema steht aus SLC-046. Pflicht-Gates: Cron-Idempotenz-Test, Live-SMTP-Test mit Test-Mitarbeiter, SPF/DKIM-Pre-Check (Pre-Deploy-Pflicht), Coolify-Cron-Setup-Anleitung im Slice-Report.
- **SLC-049** (Frontend Reminders-UX): InactiveEmployeesCard + Mitarbeiter-Liste-Filter `?filter=inactive` + Settings-Page mit Opt-Out-Toggle. Braucht SLC-046. Profitiert von SLC-048 (Reminder-Pipeline aktiv), funktioniert aber standalone.
- **SLC-050** (Frontend Help): 5 Help-Markdown-Files + HelpSheet + HelpTrigger + 5 Tooltips. Tooltips brauchen SLC-047 (Wizard-Spaeter-Button) + SLC-049 (Inactive-Badge). Pflicht-Gate: Berater-Inhalts-Review der 5 Help-Files.

**Empfohlene Reihenfolge:** 046 → 047 ∥ 048 → 049 → 050 → Gesamt-V4.2-/qa.

**Parallelisierbar:**
- SLC-047 und SLC-048 koennen parallel laufen sobald SLC-046 done (verschiedene Pfade — Frontend-Wizard vs. Backend-Cron).
- SLC-049 kann starten sobald SLC-046 done (Schema steht). SLC-049 braucht SLC-048 nicht hart, profitiert aber vom Reminder-Loop fuer Real-Smoke-Test.
- SLC-050 ist letzter — Tooltips brauchen alle anderen V4.2-Slices done.

**Pflicht-Gates fuer V4.2:**
- SLC-046: 4-Rollen-RLS-Matrix-Erweiterung um `reminder_log` + `user_settings` (16 Test-Faelle, 100% PASS gegen Live-DB).
- SLC-046: Multi-Admin-Lock-Race-Test fuer setWizardStarted.
- SLC-046: Migration-Live-Deploy via base64-pipe + `psql -U postgres` auf Hetzner.
- SLC-047: Browser-Smoke-Test mit Nicht-Tech-User-Persona (SC-V4.2-9, R17-Pattern).
- SLC-048: Cron-Idempotenz-Test (zwei Cron-Runs am selben Tag → 0 Doppel-Mails, SC-V4.2-12).
- SLC-048: Live-SMTP-Test mit Test-Mitarbeiter-Account.
- SLC-048: SPF/DKIM-Pre-Check der Server-Domain (eigener Maintenance-Sprint, Pre-Deploy-Pflicht).
- SLC-048: Coolify-Cron-Setup-Anleitung im Slice-Report (feedback_cron_job_instructions).
- SLC-050: Berater-Inhalts-Review der 5 Help-Files (kein Lorem-Ipsum, mind. 100 Worter pro File).
- Gesamt-V4.2-/qa nach SLC-050 (SC-V4.2-1..12 vollstaendig verifiziert).

### V4.2 Variante-A-Bestaetigung (MIG-029)

In /architecture V4.2 wurde Variante A vs. Variante B fuer MIG-029 als offene Frage markiert. /slice-planning V4.2 entscheidet final fuer **Variante A**: Single-Migration-File `sql/migrations/080_v42_self_service.sql` mit allen 3 logischen Bloecken (tenants ALTER + reminder_log + user_settings), deployed in SLC-046 MT-1.

Begruendung:
- Pattern-Konsistenz mit V4.1 SLC-041 (MIG-028 hatte 4 Bloecke in einem File).
- Ein DEPLOY-Run statt zwei reduziert Drift-Risiko.
- Schema-Foundation komplett vor Slice-Implementation — SLC-048 kann direkt mit Code starten ohne weiteren DB-Schritt.
- RLS-Policies regeln Sichtbarkeit von Anfang an korrekt — keine Halb-Schema-Phase.

## V4.3 Slices (Maintenance-Sammelrelease)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-051 | [Reader-UX-Bundle (Scroll-Spy + Permalink + Skeleton + Mobile-h1 + h1-Anchor-Hover)](SLC-051-reader-ux-bundle.md) | V4.3 | deployed | Medium | 2026-05-01 |
| SLC-052 | [Worker+Templates-Hygiene (TOC-Anchor-Links + Umlaut-Konsistenz)](SLC-052-worker-templates-hygiene.md) | V4.3 | deployed | Medium | 2026-05-01 |
| SLC-053 | [Tooling-Migrations (middleware->proxy + ESLint-9 flat-config)](SLC-053-tooling-migrations.md) | V4.3 | deployed | High | 2026-05-01 |
| SLC-054 | [Cross-Snapshot-Suche client-side + Search-History localStorage](SLC-054-cross-snapshot-search.md) | V4.3 | deployed | Low | 2026-05-01 |
| SLC-055 | [UX-Findings-Bundle (Tooltip-Target-Fix + Help-Konsolidierung)](SLC-055-ux-findings-bundle.md) | V4.3 | deployed | Medium | 2026-05-01 |
| SLC-056 | [ADR State-Maschinen-Pattern + Spike Turbopack-Layout-Inlining](SLC-056-adr-and-spike.md) | V4.3 | deployed | Medium | 2026-05-01 |

### V4.3 Execution Order (per DEC-062)

Reihenfolge: **SLC-053 → SLC-051 → SLC-052 → SLC-055 → SLC-056 → SLC-054**

- **SLC-053** (Tooling, ERSTER Slice): Migration-Risiko zuerst. Nachfolgende Slices laufen auf stabilem Tooling. Pflicht-Gates: Pre/Post Lint-Output-Snapshots dokumentieren, Auth-Middleware/Proxy-Tests 100% PASS, `npm run build` ohne Deprecation-Warning.
- **SLC-051** (Frontend Reader-UX): Reader-UX-Bundle (Scroll-Spy + Permalink + Skeleton + Mobile-h1 + h1-Anchor-Hover). Browser-Smoke 1280×800 + 375×667 Pflicht (SC-V4.3-2).
- **SLC-052** (Backend+Templates): Worker-Output-Hygiene + Umlaut-Konsistenz. `slugifyHeading`-Util-Module geteilt mit Reader (Q-V4.3-I). User-Pflicht: Demo-Snapshot manuell re-generaten zur Verifikation.
- **SLC-055** (Frontend UX-Findings): Help-Konsolidierung Variante 3 (Learning-Center bekommt Tab "Diese Seite") + Tooltip-Target-Fix Variante 2 (Card-Header als Wrapper-Trigger). Browser-Smoke beide Findings auf Desktop + Mobile (SC-V4.3-7 + SC-V4.3-2).
- **SLC-056** (Architektur+Spike): ADR-Doku-Erweiterung + Spike Investigation Turbopack-Layout-Inlining in eigenem Branch (DEC-066, 4h-Box). Spike-Output Pflicht: GitHub-Issue ODER Workaround-ADR.
- **SLC-054** (Frontend Cross-Snapshot-Search): Letzter V4.3-Code-Slice. Reader-Suche client-side ueber alle Snapshots + localStorage-History. Performance-Warning bei vielen Snapshots.

**Parallelisierbar:**
- SLC-056 Spike kann parallel zu SLC-054 laufen (kein Code-Overlap).
- BL-067 (Berater-Help-Review, Content-Only, kein Code-Slice) parallel via direkten Editor-Workflow.

**Pflicht-Gates fuer V4.3:**
- Keine Schema-Migration (SC-V4.3-5). Wenn ein Slice doch eine wuerde, sofort an User eskalieren.
- ESLint-Output-Snapshot vor + nach SLC-053 (R-V4.3-3-Mitigation).
- Investigation BL-066 timeboxed 4h (R-V4.3-5).
- Browser-Smoke-Test nach SLC-051 + SLC-055 (Reader-UX + Help-Konsolidierung) auf Desktop + Mobile.
- 4-Rollen-RLS-Matrix bleibt 100% PASS in /qa pro Slice.
- V4.2-Regression-Smoke pro Slice (SC-V4.3-6).
- Gesamt-V4.3-/qa nach SLC-054 (SC-V4.3-1..10 vollstaendig verifiziert).

### BL-067 Berater-Help-Review (Content-Only, deferred)

BL-067 ist KEIN Code-Slice — direkter Editor-Workflow vom User selbst. 5 Help-Markdown-Files unter `src/content/help/*.md` (dashboard.md, capture.md, bridge.md, reviews.md, handbook.md). **Status: deferred (kein Release-Pinning)** seit /post-launch V4.4 (RPT-162, 2026-05-05). Wird abgeschlossen sobald User die inhaltliche Review macht; laeuft parallel zu V5+ ohne Release-Bindung.

## V4.4 Slices (Pre-V5-Hygiene Maintenance)

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-061 | [Lint-Sweep V2-V4.2 Pre-existing Errors+Warnings](SLC-061-lint-sweep.md) | V4.4 | done | Medium | 2026-05-05 |
| SLC-062 | [SQL-Backfill 046_seed_demo_template Umlaute (MIG-030)](SLC-062-sql-backfill-umlauts.md) | V4.4 | done | Low | 2026-05-05 |

## V5 Slices (Walkthrough-Mode + Methodik-Schicht — V5 Option 2 Re-Plan 2026-05-06)

V5-Scope wurde am 2026-05-06 nach USP-Stress-Test re-geplant (DEC-079 Strategaize-Dev-System + DEC-089 Onboarding-Anker). Roh-Video-Berater-Review (FEAT-036, SLC-073) wurde **superseded by SLC-079** (Status finalisiert 2026-05-08 nach RPT-193 — Begriff `superseded` statt `deferred`, weil DEC-079 explizit "kein Re-Open-Pfad in V5.x" sagt; "deferred" suggerierte faelschlich "kommt spaeter"). Stattdessen vorgezogene Methodik-Schicht aus V5.1 (PII-Redaction + Schritt-Extraktion + Auto-Mapping + Methodik-Review-UI). Resultat: 7 Slices statt urspruenglicher 4.

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-071 | [Walkthrough Foundation: MIG-031 + Capture-UI + Direct-Upload](SLC-071-walkthrough-foundation-capture-upload.md) | FEAT-034 | done | Blocker | 2026-05-05 |
| SLC-072 | [Walkthrough Whisper-Worker (Job-Handler `walkthrough_transcribe`)](SLC-072-walkthrough-whisper-worker.md) | FEAT-035 | done | High | 2026-05-05 |
| SLC-073 | [Walkthrough Berater-Review-UI (Roh-Video) — SUPERSEDED BY SLC-079](SLC-073-walkthrough-berater-review-ui.md) | FEAT-036 | superseded | Low | 2026-05-05 |
| SLC-074 | [Registry-Update + 48-Faelle-RLS-Matrix + Cleanup-Cron (V5 Option 2 Re-Scope)](SLC-074-walkthrough-registry-rls-cleanup.md) | FEAT-034, FEAT-035, FEAT-037, FEAT-040 | done | Blocker | 2026-05-05 |
| SLC-075 | [Walkthrough Routing-Patch + Self-Spawn-Pattern (Q-V5-F)](SLC-075-walkthrough-routing-patch-self-spawn.md) | FEAT-034 | done | Blocker | 2026-05-06 |
| SLC-076 | [Walkthrough Stufe 1 PII-Redaction (Migration 087 + Pattern-Library + Worker)](SLC-076-walkthrough-pii-redaction.md) | FEAT-037 | done | High | 2026-05-06 |
| SLC-077 | [Walkthrough Stufe 2 Schritt-Extraktion (Migration 085 + Worker)](SLC-077-walkthrough-step-extraction.md) | FEAT-037 | done | High | 2026-05-06 |
| SLC-078 | [Walkthrough Stufe 3 Auto-Mapping (Migration 086 + Bridge-Engine-Reuse)](SLC-078-walkthrough-subtopic-mapping.md) | FEAT-037 | done | High | 2026-05-06 |
| SLC-079 | [Walkthrough Methodik-Review-UI (FEAT-040)](SLC-079-walkthrough-methodik-review-ui.md) | FEAT-040 | done | High | 2026-05-06 |

## V5.1 Slices (Walkthrough Handbuch-Integration — FEAT-038)

V5.1-Scope auf FEAT-038 geshrinkt nach DEC-079 V5-Option-2-Pivot (RPT-170 Requirements re-done 2026-05-06). Architecture done 2026-05-08 (RPT-197) — alle 3 Open Questions Q-V5.1-A/B/C entschieden, 5 DECs (DEC-095..099), 1 Migration MIG-033 (Migration 089: rpc_get_walkthrough_video_path SECURITY DEFINER + handbook_schema-DML idempotent fuer 2 produktive Templates). Foundation 100% Reuse aus V4.1+V5: keine neuen Tabellen, keine neuen Buckets, keine neuen npm-Pakete, keine neuen Worker-Job-Typen, keine neuen Bedrock-Calls. Slice-Numbering: V5.1 = SLC-09X-Block (V5 = SLC-07X-Block, V5.0.X-Hotfix-Reservierung = SLC-08X frei).

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-091 | [Walkthrough Handbuch-Section-Renderer + Storage-Proxy + RPC + MIG-033](SLC-091-walkthrough-handbook-section-renderer.md) | FEAT-038 | deployed | High | 2026-05-08 |
| SLC-092 | [Walkthrough Handbuch-Reader-Integration + Stale-Marker + Audit + RLS-Matrix](SLC-092-walkthrough-handbook-reader-integration.md) | FEAT-038 | deployed | High | 2026-05-08 |

### V5.1 Execution Order

Reihenfolge strikt sequentiell:

**SLC-091 (Backend) → Coolify-Deploy + MIG-033 Live-Apply → SLC-092 (Frontend + RLS-Matrix + Browser-Smoke)**

- **SLC-091** (Backend-Foundation, ~5-7 MTs, ~1.5 Tage): Schema-Validator-Erweiterung + Loader + Renderer + Worker-Integration + Migration 089 SQL-File + Storage-Proxy-Endpoint mit Range-Support + Vitest 8+. MT-7 ist Migration 089 Live-Apply auf Hetzner (Pre-Apply-Backup pflicht).
- **SLC-092** (Frontend-Integration, ~3-5 MTs, ~1-1.5 Tage): react-markdown `<video>` Render-Path + Stale-Banner-Erweiterung + Audit-Log-Hook (DEC-098) + 12-24-Faelle-RLS-Matrix gegen Coolify-DB + User-Pflicht-Browser-Smoke (11-Punkte-Checklist). Optional MT-5 Cockpit-Card-Sub-Hint.

**Total V5.1: 2 Slices, ~10-13 MTs, ~3-4 Tage Implementation + Release-Sequenz.**

### V5.1 Pflicht-Gates fuer Release

- **SC-V5.1-1 Snapshot rendert Walkthroughs**: nach Snapshot-Generation enthaelt das ZIP `XX_walkthroughs.md` mit Markdown-Section pro approved Walkthrough.
- **SC-V5.1-2 Embed-Player spielt Video ab + Seek funktioniert**: HTML5 `<video>` laedt via Storage-Proxy, Browser kann seek-en (Range-Requests 206).
- **SC-V5.1-3 Cross-Tenant-Schutz**: tenant_admin von Tenant B bekommt 403/404 fuer `/api/walkthrough/[sessionId]/embed` mit Tenant-A-Session.
- **SC-V5.1-4 Stale-Banner triggert** wenn approved Walkthrough nach letztem Snapshot existiert.
- **RLS-Matrix walkthrough-embed**: 12-24 Faelle gruen (4 Rollen × 3 Status × 2 Tenant-Konstellationen, oder Subset wenn redundant).
- **Browser-Smoke User-Pflicht**: Reader-Page mit echtem Walkthrough-Snapshot — Video abspielen, Seek testen, Stale-Banner verifizieren, Audit-Log-Eintrag pro Page-Load (NICHT pro Range-Request).
- **Code-Quality**: `npm run lint` 0/0, `npm run build` PASS, `npm run test` alle gruen, `npm audit --omit=dev` keine neuen Vulns (V5.1 fuegt keine npm-Deps hinzu).

### V5.1 Pre-Conditions

- V5 Option 2 STABLE (Cron-Run-Verifikation 2026-05-09 03:00 ausstehend)
- `/post-launch V5` PASS (~14:00 Europe/Berlin nach 18-24h-Window)
- Mindestens 1 approved walkthrough_session als Test-Daten — bereits erfuellt via SC-V5-4 (`75098a5d` user-approved 2026-05-08)

### V5.1 Out-of-Scope (deferred V5.2+)

- Walkthrough-Embedding inline in andere Sections (z.B. SOP-Section) → V5.2+ (DEC-095)
- Stream/Pipe Range-Implementation (bandwidth-effizient, Pre-Production-Pattern) → V5.2+ (DEC-096)
- Auto-Re-Generation-Trigger pro approved Walkthrough mit Throttle → V5.2+ (DEC-097)
- Walkthrough-Search im Reader → V5.2+ (FEAT-038-Spec — existing Cross-Snapshot-Suche umfasst Walkthroughs-Markdown automatisch via V4.3 SLC-054)
- Subtitle-Tracks aus Whisper-Transkript → V5.2+ (FEAT-038-Spec)
- Adaptive Streaming / HLS → Pre-Production
- Video-Level-PII-Redaction → Pre-Production-Compliance-Gate

### V5 Option 2 Execution Order

Reihenfolge (mit Mid-Stream-Hotfix-Slot fuer BL-076 zwischen SLC-079 und SLC-074):

**SLC-071 (code-side done) → SLC-075 → SLC-072 → SLC-076 → SLC-077 → SLC-078 ∥ SLC-079 → BL-076-Hotfix → SLC-074**

- **SLC-071** (Foundation, code-side done): MIG-031 (082+083+084) live appliziert, Capture-UI + Direct-Upload code-funktional. Status bleibt `in_progress` bis SLC-075 abgeschlossen (Browser-Smoke AC-10/11/12 nachholen). Code bleibt unveraendert verwertbar.
- **SLC-075** (Routing-Patch, ERSTER Option-2-Slice): Self-Spawn-Pattern (DEC-080) + neue Routen `/employee/walkthroughs` + AC-10/11/12 Smoke. Loest BL-086 = Q-V5-F kritisch. ~3 MTs.
- **SLC-072** (Worker-Pfad): walkthrough_transcribe unveraendert. **In V5 Option 2:** Pipeline-Trigger advanced auf `redacting` (statt `pending_review`) — Patch in SLC-076 MT-5. ~5 MTs.
- **SLC-076** (Stufe 1 PII-Redaction): Migration 087 + walkthrough_redact_pii Worker + PII-Pattern-Library + synthetische Test-Suite (≥90% Recall, SC-V5-6). ~5 MTs.
- **SLC-077** (Stufe 2 Schritt-Extraktion): Migration 085 + walkthrough_extract_steps Worker + Schritt-Persistierung + ≥5 Test-Walkthroughs. ~5 MTs.
- **SLC-078** (Stufe 3 Auto-Mapping): Migration 086 + walkthrough_map_subtopics Worker mit **Bridge-Engine-Pattern Reverse-Direction** (FEAT-023 Reuse-Pflicht) + Coverage-Test ≥70% (SC-V5-7). ~4 MTs.
- **SLC-079** (Methodik-Review-UI): 3 Admin-Routen + SubtopicTreeReview + UnmappedBucket + MoveStepDropdown + ApprovalForm mit Pflicht-Privacy-Checkbox (DEC-091) + Cockpit-Card + RawTranscriptToggle mit Audit. Pattern-Reuse FEAT-023 + FEAT-029. **Kann parallel zu SLC-078 laufen**, sobald walkthrough_step + walkthrough_review_mapping Schemas live (also nach SLC-077 Migration 085 + SLC-078 Migration 086). ~7 MTs.
- **BL-076 Cron-Idempotenz-Hotfix** (Mid-Stream zwischen SLC-079 und SLC-074): Fix der V4.2 capture-reminders-Cron-Idempotenz-Logik (ISSUE-035). **Bewusst zwischen SLC-079 und SLC-074 platziert**, weil SLC-074 den `walkthrough-cleanup-daily`-Cron erweitert um Stale-Pipeline-Recovery und das gefixte Idempotenz-Pattern aus BL-076 dort sofort uebernehmen kann. Eigene atomare Aenderung, eigener Commit, kein Code-Merge mit V5-Slices.
- **SLC-074** (V5-Option-2-Abschluss, re-scoped): Capture-Mode-Registry-Update + **48-Faelle-RLS-Matrix** (16 walkthrough_session + 16 walkthrough_step + 16 walkthrough_review_mapping) + Cleanup-Cron erweitert um Stale-Pipeline-Recovery (`redacting/extracting/mapping > 1h → failed`) + Lint/Build/Test/Audit gruen als V5 Option 2 Release-Gate. Vor Gesamt-V5-Option-2-/qa. ~5 MTs.

**Gesamt V5 Option 2:** 7 Option-2-Slices (SLC-072 + SLC-074 + SLC-075..079) + SLC-071 als-ist + SLC-073 superseded by SLC-079 = **34 MTs / ~5-6.5 Tage Implementation** (entspricht ARCHITECTURE.md V5 Option 2 Empfehlung + DEC-079-Aufwand).

**Parallelisierbar:**
- SLC-079 kann parallel zu SLC-078 starten sobald SLC-077 done ist (Schemas walkthrough_step + walkthrough_review_mapping live nach Migration 085 + 086 — d.h. nach SLC-077-MT-1 + SLC-078-MT-1).
- BL-067 (Berater-Help-Review, Content-Only, deferred) jederzeit parallel via direkten Editor-Workflow.

**Pflicht-Gates fuer V5 Option 2 Release:**
- SLC-075: AC-10/11/12 Browser-Smoke gruen (loest BL-086 = Q-V5-F).
- SLC-072: Pipeline-Trigger advanced auf `redacting` (Patch via SLC-076 MT-5).
- SLC-076: **SC-V5-6 PII-Redaction-Recall ≥90%** auf synthetischer Test-Suite.
- SLC-077: Migration 085 + ≥5 Test-Walkthroughs Vitest.
- SLC-078: **SC-V5-7 Auto-Mapping ≥70%** Schritte mit Confidence ≥0.7. Bridge-Engine-Pattern-Konsistenz-Diff zu `bridge-engine-worker.ts`.
- SLC-079: **SC-V5-4 Berater-Methodik-Review-Smoke** alle 3 Admin-Routen + Move + Approve mit/ohne Checkbox.
- BL-076 done VOR SLC-074-Beginn (Pattern-Vorlage fuer Cleanup-Cron).
- SLC-074: **SC-V5-5 48-Faelle-RLS-Matrix gruen** + SC-V5-1 Mitarbeiter-Self-Test + **SC-V5-8 Code-Quality** (0/0 Lint, 0 Vulns).
- Gesamt-V5-Option-2-/qa nach SLC-074 (SC-V5-1, SC-V5-4..8 vollstaendig verifiziert).

### V5 Out-of-Scope (deferred V5.1+)

- Walkthrough-Embed im Handbuch-Reader + KU-Bruecke walkthrough_step → knowledge_unit → V5.1 (FEAT-038, DEC-090, BL-082)
- FEAT-036 Roh-Video-Berater-Review → SLC-073 superseded by SLC-079 (per DEC-079 strukturell durch FEAT-040 Methodik-Review-UI ersetzt, kein Re-Open-Pfad in V5.x geplant; Roh-Daten-Einsicht laeuft via `RawTranscriptToggle` in SLC-079 mit Audit-Log DEC-088)
- Mehrsprachige Transkription (DE only fuer V5)
- Mobile-Capture, Klick-Tracking, DOM-Snapshots → V6+
- Re-Open-Pfad fuer rejected → V5.2+
- Reviewer-Markdown-Notes pro Schritt → V5.2+
- Retry-Mechanik fuer failed-Pipeline-Stufen → V5.2+
- Per-Tenant-PII-Pattern-Override → V5.x (DEC-082)
- Per-Tenant-Confidence-Schwelle → V5.x (DEC-084)
- Haiku-Optimization fuer Stufe 3 → V5.x (DEC-081)
- Re-Processing approved Walkthroughs (z.B. nach Subtopic-Tree-Aenderung) → V5.x

### V4.4 Execution Order (per DEC-073)

Reihenfolge: **SLC-061 → SLC-062**

- **SLC-061** (Lint-Sweep, ERSTER Slice): Code-Touch in 7-9 Files unter `src/`, schneller Lint-Loop. Verifikation `npm run lint` 0/0 + `npm run build` + `npm run test`. Pflicht-Gates: Pre/Post Lint-Output-Snapshots, Inline-Disables nur in 2 Files (sidebar.tsx + EvidenceFileList.tsx) per DEC-070.
- **SLC-062** (SQL-Backfill, ZWEITER Slice): MIG-030 anlegen + Hetzner-Apply via base64-Pattern + Post-Apply-Audit. Pre-Apply-Backup-Pflicht. Verifikation: `audit-umlauts.mjs` post-Apply = 0 Vorkommnisse. Idempotenz: 2. Apply produziert keinen DML-Drift.

**Parallelisierbar:**
- BL-067 (Berater-Help-Review, Content-Only) jederzeit parallel via direkten Editor-Workflow vom User. Kein Code-Slice.

**Pflicht-Gates fuer V4.4:**
- Keine Schema-DDL (SC-V4.4-6). Wenn ein Slice doch DDL braucht → eskalieren.
- Pre/Post Lint-Snapshot fuer SLC-061.
- Pre-Apply-Backup + Post-Apply-Audit fuer SLC-062.
- V4.3-Regression-Smoke pro Slice (Reader, Help-Sheet, Cross-Search, Bridge-Edit, Jitsi-Meeting).
- Gesamt-V4.4-/qa nach SLC-062 (SC-V4.4-1..6 vollstaendig verifiziert).

## V6 Slices (Multiplikator-Foundation — Steuerberater-Partner-Erweiterung)

V6-Scope (RPT-209 Requirements + RPT-210 Architecture + RPT-211 Slice-Planning). 6 Features (FEAT-041..046) in 6 Slices (SLC-101..106) zerlegt. Slice-Numbering V6 = SLC-1XX-Block (V5 = SLC-07X, V5.1 = SLC-09X, V5.0.X-Hotfix-Reservierung = SLC-08X frei). Reuse-Quote ~60% — Capture-Mode-Architektur FEAT-025, RLS-Defense-in-Depth-Pattern V4/V5 inkl. SAVEPOINT, next-intl + lokalisierte Bedrock-Prompts, Tenant-Onboarding-Wizard FEAT-031, Lead-Intake-API Business-System mit First-Touch-Lock+UTM, DEC-091 Privacy-Checkbox-Pattern, DEC-099 RPC-SECURITY-DEFINER-Pattern, Walkthrough-Storage-Proxy-Pattern (SLC-091). Migration MIG-034 in 3 sequenziellen Migration-Files (090+091+092) ueber 3 Slices verteilt.

| ID | Slice | Feature | Status | Priority | Created |
|----|-------|---------|--------|----------|---------|
| SLC-101 | [Partner-Tenant Foundation + RLS + Pen-Test-Suite (Migration 090)](SLC-101-partner-tenant-foundation-rls-pentest.md) | FEAT-041 | done | Blocker | 2026-05-11 |
| SLC-102 | [Partner-Organisation + Onboarding-Flow + Admin-Dashboard](SLC-102-partner-organization-admin-dashboard.md) | FEAT-042 | done | High | 2026-05-11 |
| SLC-103 | [Partner-Client-Mapping + Mandanten-Einladung](SLC-103-partner-client-mapping-mandanten-einladung.md) | FEAT-043 | done | High | 2026-05-11 |
| SLC-104 | [Partner-Branding + CSS-Custom-Properties + RPC (Migration 091)](SLC-104-partner-branding-css-custom-properties.md) | FEAT-044 | in_progress | High | 2026-05-11 |
| SLC-105 | [Diagnose-Werkzeug + Light-Pipeline + Bericht-Renderer (Stop-Gate BL-095)](SLC-105-diagnose-werkzeug-light-pipeline-renderer.md) | FEAT-045 | planned | High | 2026-05-11 |
| SLC-106 | [Lead-Push opt-in + Outbound Webhook + DSGVO-Audit (Migration 092)](SLC-106-lead-push-opt-in-outbound-webhook.md) | FEAT-046 | planned | High | 2026-05-11 |

### V6 Execution Order

Strikt sequentielle Pflicht-Reihenfolge fuer SLC-101 → SLC-102 → SLC-103 → SLC-104 → SLC-105 → SLC-106.

- **SLC-101 (Foundation + Pen-Test, Pflicht-Vorgaenger fuer ALLE):** Migration 090 + neue Rolle `partner_admin` + `partner_organization` + `partner_client_mapping` Schema + RLS-Policy-Updates auf bestehenden Tabellen + **Pen-Test-Suite mit mind. 96 V6 + 94 Regression = 190 Faelle** (DEC-110). Pflicht-Gate: SLC-102..106 duerfen erst nach Pen-Test PASS starten.
- **SLC-102 (Partner-Org + Admin-Dashboard):** Strategaize-Admin-UI `/admin/partners` + Partner-Admin-Dashboard-Strukturen `/partner/dashboard` + Auth-Routing-Erweiterung fuer `partner_admin` + Server Actions (`createPartnerOrganization`, `invitePartnerAdmin`, `updatePartnerStammdaten`, `acceptPartnerAdminInvitation`). Reuse: FEAT-031 Magic-Link-Pattern.
- **SLC-103 (Mandanten-Mapping + Einladung):** `partner_client_mapping`-Server-Actions (`inviteMandant`, `acceptMandantInvitation`, `revokeMandantInvitation`) + Mandanten-Liste-UI im Partner-Dashboard + Mandanten-Dashboard-Erweiterung `/dashboard` mit tenant_kind-aware Welcome-Block + Diagnose-Karte-Placeholder. Pen-Test-Faelle fuer `partner_client_mapping` aus SLC-101-Placeholder aktivieren.
- **SLC-104 (Branding + CSS-Custom-Props + Migration 091):** `partner_branding_config`-Tabelle + RPC `rpc_get_branding_for_tenant` (DEC-099-Pattern) + Storage-Bucket + CSS-Custom-Properties Setup erstmals (DEC-106 Server-Side Inline-Style im Root-Layout) + Tailwind-Config-Erweiterung + Pflicht-Footer Server-Component (DEC-108) + Branding-UI im Partner-Dashboard mit Live-Preview. Backfill bestehender Partner-Tenants.
- **SLC-105 (Diagnose-Werkzeug + Light-Pipeline + Renderer):** **STOP-GATE BL-095 Inhalts-Workshop** — kann erst starten wenn 15-25 Fragen + Score-Logik + Pflicht-Output-Aussage vom User vorliegen. Neuer Template-Seed `partner_diagnostic_v1` (Migration 091a) + Worker-Branch in `src/workers/condensation/run.ts` ueber `template.metadata.usage_kind` (DEC-105) + deterministische Score-Compute + Bedrock-Verdichtungs-Prompt + Auto-Finalize-Tx (KU `status='accepted'` + `validation_layer.reviewer_role='system_auto'` + `block_checkpoint.checkpoint_type='auto_final'`) + Mandanten-Run-Flow `/dashboard/diagnose/start` + Bericht-Renderer.
- **SLC-106 (Lead-Push + Migration 092, LETZTER V6-Slice):** `lead_push_consent` + `lead_push_audit` Tabellen + `ai_jobs.job_type` CHECK-Erweiterung um `'lead_push_retry'` + Outbound HTTP-Adapter `lead-intake.ts` + Server Action `requestLeadPush` mit Pflicht-DSGVO-Checkbox (DEC-091-Pattern, V5 SLC-079 Reuse) + Worker-Handler `lead_push_retry` mit 3-Versuche-Limit (DEC-112) + "Ich will mehr"-Modal + Cross-System-Smoke gegen Business-System.

**Parallelisierbar:**
- BL-094 (AVV-Templates DE+NL, User-Verantwortung, kein Code), BL-096 (GTM-Akquise-Pitch Achse 9, User-Verantwortung) — beide parallel zum V6-Code-Bau ohne Slice-Block.
- BL-095 (Inhalts-Workshop, **Stop-Gate fuer SLC-105**) — parallel zu SLC-101..104 + SLC-106 startbar; muss vor SLC-105-Beginn fertig sein.

**Pflicht-Gates fuer V6:**
- **SC-V6-1 Pen-Test-Suite-PASS (SLC-101)**: mind. 96 V6 + 94 Regression Faelle gegen Coolify-DB im node:20-Container (Cross-Partner + Cross-Client + V4-Regression + V5.1-Regression) — **Pflicht-Vorgaenger fuer alle weiteren V6-Slices** (DEC-110).
- **SC-V6-2 Strategaize-Admin Partner-Anlage < 5 Minuten (SLC-102)**.
- **SC-V6-3 Partner-Admin sieht nur eigene Mandanten (SLC-102 + SLC-103)** + Cross-Partner-Isolation in Pen-Test gruen.
- **SC-V6-4 Mandanten-Magic-Link + Partner-Branding sichtbar (SLC-103 + SLC-104)**.
- **SC-V6-5 Mandanten-Diagnose end-to-end ohne menschlichen Eingriff (SLC-105)**.
- **SC-V6-6 Bericht enthaelt deterministischen Score + KI-Kommentar (SLC-105)**: Score-Logic-Vitest deterministisch + Live-Smoke verifiziert.
- **SC-V6-7 Lead-Push nur bei aktiver Checkbox + korrektem UTM (SLC-106)**.
- **SC-V6-8 lead_push_audit zeigt success-Eintrag (SLC-106)** + Cross-System-Smoke gegen Business-System contacts-Tabelle.
- **SC-V6-9 Pflicht-Footer auf allen Seiten sichtbar + via DB-Manipulation nicht entfernbar (SLC-104, DEC-108)**.
- **SC-V6-10 V5.1-Regression-frei (alle Slices)**: Walkthrough Handbuch-Integration weiter funktional, RLS-Matrix gruen.
- **SC-V6-11 AVV-Standard-Template DE existiert (BL-094, User-Verantwortung, kein Code-Block)**.
- **SC-V6-12 User-Pflicht-Klick-Test End-to-End nach Deploy (Gesamt-V6-/qa)**: Demo-Partner + Demo-Mandant + Demo-Diagnose + Demo-Lead-Push.

**Code-Quality-Gates pro Slice:**
- `npm run lint` 0/0 auf neuen + geaenderten Files.
- `npm run build` PASS mit dummy-ENV.
- `npm run test` Vitest-Suite gruen (Pen-Test-Suite aus SLC-101 muss bei jedem Slice gruen bleiben).
- `npm audit --omit=dev` 0 neue Vulns (V6 fuegt keine npm-Deps hinzu — Tailwind-Config-Erweiterung in SLC-104 ist konfigurativ; alle 6 Slices nutzen Reuse).
- Pflicht-`/qa` nach jedem `/backend` oder `/frontend` (mandatory-completion-report.md Sektion 9).

**Migration-File-Mapping (per IMP-432 Pattern):**
- Migration 090 (Foundation + Schema + RLS) → SLC-101 MT-7 (Live-Apply auf Hetzner).
- Migration 091 (Branding + RPC + CHECK-Erweiterungen + Storage-Bucket) → SLC-104 MT-2.
- Migration 091a (Template-Seed `partner_diagnostic_v1`) → SLC-105 MT-2. (Separater idempotenter Seed-File.)
- Migration 092 (Lead-Push-Tabellen + ai_jobs CHECK) → SLC-106 MT-2.

Alle Migrations folgen sql-migration-hetzner.md Pattern (base64-Pipe + `psql -U postgres -v ON_ERROR_STOP=1` + Pre-Apply-Backup unter `/opt/onboarding-plattform-backups/`).

**Foundation-Effort-Markierung (per IMP-433 Pattern):**
- SLC-104 CSS-Custom-Properties + Tailwind-Theme-Erweiterung sind **Erstmals-Effort** (kein Reuse, neue Plattform-Foundation). Erwarteter MT-Aufwand fuer Tailwind-Theme-Erweiterung: ~1 MT, fuer Server-Side-Resolver-Setup: ~2 MTs.
- SLC-105 Light-Pipeline-Worker-Branch ist **leichter Erstmals-Effort** (Branch innerhalb bestehender Worker-Funktion, kein neuer Worker-File, kein neuer Job-Typ — DEC-105).
- SLC-106 Outbound HTTP-Adapter ist **leichter Erstmals-Effort** (erster outbound HTTP-Call der Plattform, aber kein neuer Container — Worker-Job-Handler reused).

**V6 Slice-Aufwand-Schaetzung:**

| Slice | MTs | geschaetzte Dauer (Solo-Founder 2-3h/Woche) |
|---|---|---|
| SLC-101 | 7 | 3-4 Tage (Pen-Test-Suite dominiert) |
| SLC-102 | 8 | 3-4 Tage |
| SLC-103 | 10 | 3-4 Tage |
| SLC-104 | 13 | 4-5 Tage (CSS-Custom-Props Erstmals-Effort) |
| SLC-105 | 12 | 4-6 Tage (abhaengig von Workshop-Output-Qualitaet) |
| SLC-106 | 13 | 4-5 Tage (Cross-System-Smoke + Retry-Pfad) |
| **Total** | **63** | **~21-28 Tage** Implementation-Werktage, ~12-20 Kalenderwochen bei Solo-Founder-Tempo |

(Aufwands-Schaetzung konsistent mit STRATEGY_NOTES_2026-05.md Abschnitt 7 Slice-Skizze 11-18 Tage SLC-080..083, wo SLC-080..083 nur die Foundation-Achse umfassten. Hier sind alle 6 V6-Slices inklusive Diagnose-Werkzeug + Lead-Push enthalten — Mehraufwand gegenueber Skizze ist erwartet.)

### V6 Out-of-Scope (deferred V6.1 / V7+)

- **NL-Sprach-Variante** des Diagnose-Werkzeugs → V6.1 (DEC-102, MULTIPLIER_MODEL Achse 7)
- **Modus-B Webinar-Tooling** → V7 (MULTIPLIER_MODEL Achse 5, nach 3-6 Monaten Modus-A-Erfahrung)
- **Sekundaerfarbe Vollintegration im Branding** → V6.1 falls Pilot-Feedback
- **Provisions-Modell + Provisions-Reporting** → V2/V3 (Konzept-V2, technisch V7+) — Attribution-Spur in `lead_push_audit` ist V6 bereit
- **Tier-System (Partner-Klassifizierung)** → V8+ — `tier` Spalte bereit (DEC-111)
- **Reverse-Channel M&A (M&A-Berater als 2. Typ)** → V8+ — `partner_kind` Spalte bereit (DEC-111)
- **Whitelabel** (Strategaize-Hinweis weg) → **niemals** (DEC-108, MULTIPLIER_MODEL T5)
- **Domain-Mapping pro Partner** → V7+ falls je
- **Berater-Personal-Mandanten-Zuordnung** (partner_employee) → V7+
- **Diary-Mode** → V8 (DEC-101, vorher V5/V6, jetzt nach Multiplikator-Priorisierung verschoben)
- **Aggregierte Markt-Intelligence-Views** → V7+ falls je
- **Auto-Re-Diagnose-Trigger** → V7+ falls je
- **Multiple parallele Templates pro Mandant** → V8+
- **Tenant-spezifische Restore-Faehigkeit** → V7+ als **BL-097 deferred** (DEC-103, Voll-Restore-Limit fuer V6 akzeptiert)
- **Berater-Override des Auto-Finalize-Berichts** → V7+ falls je
- **Re-Push bei aktualisiertem Diagnose-Bericht** → V7+
- **Webhook Business-System → Onboarding Bidirektional** → V7+
- **Manueller Lead-Push-Trigger durch partner_admin** → V7+ (V6 nur Mandanten-Initiative)
- **Operations-Dashboard fuer lead_push_failure Re-Push** → V7+ (V6 hat nur DB-Log via error_log)
- **PDF-Export Diagnose-Bericht** → V6.1+ (V6 nur HTML-Print)
- **Resend-Magic-Link-Button** → V6.1

### V6 Pre-Conditions

- V5.1 deployed + STABLE (kein paralleler Migration-Apply auf produktive Templates). V6 Migrations sind additiv ohne Beruehrung der V5.1-Schemata.
- V5.1 18-24h-Beobachtungs-Window darf parallel laufen (kein Block, Migration 090 ist additiv).
- Pen-Test-Suite-Pattern aus `v5-walkthrough-rls.test.ts` (SAVEPOINT) verfuegbar als Reuse-Vorlage.
- Coolify-Test-Setup mit node:20-Container gegen Coolify-DB verfuegbar (siehe `coolify-test-setup.md` Rule).
- SQL-Migration-Hetzner-Procedure (base64 + psql -U postgres) verfuegbar (siehe `sql-migration-hetzner.md` Rule).

### V6 Stop-Gate fuer SLC-105: BL-095 Inhalts-Workshop

**SLC-105 darf nicht starten** bevor BL-095 (Inhalts-Workshop Diagnose-Werkzeug) folgendes liefert:
- 15-25 konkrete Mandanten-Fragen entlang der 6 MULTIPLIER_MODEL-Bausteine.
- **Deterministische Score-Logik** pro Frage (Antwort-Wert → 0-100 Score).
- Pflicht-Output-Aussage als Markdown-Footer.

SLC-101..104 + SLC-106 sind **unabhaengig** und koennen vor Workshop-Abschluss starten.

Falls Workshop-Output nicht tragbar fuer DGN-A (zu offene Fragen, KI-Ermessen zu gross): **Fallback auf DGN-C** (Hybrid mit Strategaize-Quick-Review) via `/architecture`-Revisions-DEC. Kein Code-Aufwand verloren — Pipeline-Logic muss um Review-Step erweitert werden.

### V6 Pflicht-Vorbereitungs-Backlog (parallel zum Code-Bau, kein Skill-Block)

- **BL-094 V6-PREP-AVV**: AVV-Standard-Template DE+NL fuer Steuerberater-Pilots (Pflicht vor erstem Live-Partner).
- **BL-095 V6-PREP-INHALT**: Inhalts-Workshop Diagnose-Werkzeug (Stop-Gate fuer SLC-105).
- **BL-096 V6-GTM-AKQUISE**: Achse 9 GTM-Akquise-Pitch (kein V6-Block, parallel).
- **BL-097 Tenant-spezifische Restore-Faehigkeit (V7+, deferred)**: durch DEC-103 eingebracht — V6 akzeptiert Voll-Restore-Limit, Slice waere V7+.
