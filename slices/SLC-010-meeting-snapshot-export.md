# SLC-010 — Meeting-Snapshot + JSON-Export

- Feature: FEAT-006 (Teil 2/2)
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Am Ende eines Debrief-Meetings erzeugt `strategaize_admin` einen finalen Snapshot des Block-Zustands als `block_checkpoint` Typ `meeting_final`. `tenant_admin` sieht den finalen Stand read-only. JSON-Export des Snapshots via API-Endpoint.

## In Scope
- Server Action `createMeetingSnapshot(sessionId, blockKey)`
- RPC-Nutzung von `rpc_create_block_checkpoint` mit Typ `meeting_final` und Content = finalisierte KUs
- UI: Meeting-Mode-Toggle auf Debrief-Seite; Button "Meeting abschliessen und Snapshot erzeugen"
- `capture_session.status`-Update auf `finalized`, wenn ALLE Bloecke `meeting_final` haben
- Read-Only-Ansicht fuer `tenant_admin`: Route `/capture/[sessionId]/block/[blockKey]/final` zeigt finalisierten Stand
- API `GET /api/export/checkpoint/[checkpointId]` → JSON, Auth-Guard (`strategaize_admin` oder `tenant_admin` des Tenants)
- Export-Schema dokumentieren

## Out of Scope
- PDF/Markdown-Export (DEC-009, V2+)
- Diff-Ansicht questionnaire_submit → meeting_final (V2+)
- Multi-Block-Aggregat-Export (V2+, V1 nur pro Checkpoint)

## Acceptance
- Admin klickt "Meeting abschliessen" → neuer Checkpoint `meeting_final`, Content enthaelt alle KUs im finalen Stand
- Nach letztem Block-Snapshot: `capture_session.status = 'finalized'`
- `GET /api/export/checkpoint/[id]` liefert valides JSON mit `content`, `content_hash`, `created_at`
- `tenant_admin` sieht finalen Stand read-only; kann nicht editieren
- RLS blockt Cross-Tenant-Export-Zugriff

## Dependencies
- SLC-001..009

## Risks
- "Alle Bloecke final" braucht Zaehler gegen Template-Blocks — Consistency-Check bei jedem Snapshot
- Export-JSON-Struktur = Vertrag fuer externe Weiterverarbeitung — Schema muss stabil dokumentiert sein

## Micro-Tasks

### MT-1: Server Action createMeetingSnapshot
- Goal: Finaler Checkpoint + Session-Status-Update.
- Files:
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/meeting-snapshot-action.ts`
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/meeting-snapshot-action.test.ts`
- Expected behavior: Sammelt alle KUs des Blocks im aktuellen Zustand, baut `content = { kus: [...], finalized_by, finalized_at }`, ruft `rpc_create_block_checkpoint(type='meeting_final')`. Prueft danach, ob ALLE Template-Bloecke einen `meeting_final` haben → UPDATE `capture_session.status = 'finalized'`.
- Verification: Test + Manual: nach Snapshot letzter Block wechselt Session-Status.
- Dependencies: SLC-006 MT-2 (RPC), SLC-008 (KUs vorhanden), SLC-009 (Editor)

### MT-2: Meeting-Mode-UI
- Goal: Toggle + Snapshot-Button auf Debrief-Seite.
- Files: `src/app/(admin)/debrief/[sessionId]/[blockKey]/MeetingModeBar.tsx`
- Expected behavior: Toggle "Vor-Meeting / Im Meeting"; Im Meeting sichtbarer "Abschliessen"-Button mit Confirm-Dialog.
- Verification: Manuell.
- Dependencies: MT-1

### MT-3: Read-Only-Final-View fuer tenant_admin
- Goal: Route zeigt finalisierten Block-Stand.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/final/page.tsx`
- Expected behavior: Laedt letzten `block_checkpoint` mit `type=meeting_final`, zeigt KUs aus `content.kus` read-only, kein Editor, kein Chat.
- Verification: Manuell + Access-Test (tenant_member darf nicht).
- Dependencies: MT-1

### MT-4: Export-API
- Goal: JSON-Endpoint mit Auth-Check.
- Files:
  - `src/app/api/export/checkpoint/[checkpointId]/route.ts`
  - `src/app/api/export/checkpoint/[checkpointId]/route.test.ts`
- Expected behavior: GET mit Auth-Cookie, liest Checkpoint via RLS, returniert `{ id, tenant_id, session_id, block_key, checkpoint_type, content, content_hash, created_at }`. Ohne Auth → 401. Anderer Tenant → 404.
- Verification: Tests (happy + unauth + cross-tenant-404).
- Dependencies: SLC-006 MT-2

### MT-5: Export-Schema-Dokumentation
- Goal: Dauerhafter Vertrag.
- Files: `docs/EXPORT_SCHEMA.md` (neu)
- Expected behavior: JSON-Schema + Beispiel-Payload + Stability-Hinweis ("V1 stable, Breaking nur mit Major-Version der Plattform").
- Verification: Schema-Datei committed.
- Dependencies: MT-4

### MT-6: Session-Status-Finalized-Logik
- Goal: Pure Function `isSessionComplete(session, checkpoints)`.
- Files:
  - `src/lib/capture/session-completion.ts`
  - `src/lib/capture/session-completion.test.ts`
- Expected behavior: True gdw. fuer jeden Template-Block mindestens 1 `meeting_final`-Checkpoint existiert.
- Verification: Unit-Test mit 3 Bloecken, 2 final / 3 final.
- Dependencies: SLC-003 (Template)

### MT-7: E2E-Smoketest
- Goal: Manueller End-to-End-Testlauf der V1.
- Files: `docs/E2E_SMOKE_TEST_V1.md` (neu) — Schritte: Session starten → Block bearbeiten → submit → KUs erwarten → debrief edit → meeting-snapshot → export JSON.
- Expected behavior: Schritte dokumentiert, ausfuehrbar durch User.
- Verification: User fuehrt Smoketest nach Deploy durch.
- Dependencies: MT-1..MT-6

## Verification Summary
- Build + Tests gruen
- Prod: Meeting-Snapshot erzeugbar, Session-Status wechselt auf finalized
- Export-API liefert stabiles JSON, RLS haelt
- E2E-Smoketest-Script vorhanden
