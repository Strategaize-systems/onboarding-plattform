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

### V4.3 BL-067 Berater-Help-Review (Content-Only)

BL-067 ist KEIN Code-Slice — direkter Editor-Workflow vom User selbst. 5 Help-Markdown-Files unter `src/content/help/*.md` (dashboard.md, capture.md, bridge.md, reviews.md, handbook.md). Aktualisierte Files werden als eigener Commit hinterlegt. Kann parallel zu jedem V4.3-Slice laufen.
