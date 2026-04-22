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
| SLC-029 | [Dialogue Session UI](SLC-029-dialogue-session-ui.md) | FEAT-019 | planned | High | 2026-04-21 |
| SLC-030 | [Recording Pipeline](SLC-030-recording-pipeline.md) | FEAT-020 | planned | Blocker | 2026-04-21 |
| SLC-031 | [Dialogue Extraction](SLC-031-dialogue-extraction.md) | FEAT-020 | planned | Blocker | 2026-04-21 |
| SLC-032 | [Pipeline Integration + Debrief](SLC-032-pipeline-integration.md) | FEAT-021 | planned | High | 2026-04-21 |

### V3 Execution Order
- **SLC-025:** Jitsi-Infra (Blocker fuer alles)
- **SLC-026 → SLC-027:** Meeting Guide Backend → UI (sequentiell)
- **SLC-028 → SLC-029:** Dialogue Session Backend → UI (sequentiell, braucht SLC-025 + SLC-026)
- **SLC-030:** Recording Pipeline (braucht SLC-025 + SLC-028)
- **SLC-031:** Dialogue Extraction (braucht SLC-030 + SLC-026)
- **SLC-032:** Pipeline Integration (braucht SLC-031 + SLC-027 + SLC-029)
- **Parallelisierbar:** SLC-026+027 kann parallel zu SLC-028+029 laufen (beide brauchen nur SLC-025). SLC-030+031 sind strikt sequentiell.
