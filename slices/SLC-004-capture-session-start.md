# SLC-004 — Capture-Session-Start + Block-Listing

- Feature: FEAT-003 (Teil 1/3)
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
`tenant_admin` kann eine Capture-Session fuer das Exit-Readiness-Template starten und sieht die zugehoerige Block-Liste mit Status. Fundament der Kunden-UX, noch ohne Questionnaire-UI.

## In Scope
- Server Action `startCaptureSession(template_slug)` — legt Row in `capture_session` an, friert `template_version` ein
- UI-Route `/capture/[sessionId]` — Server Component, listet alle Bloecke aus `capture_session.template.blocks`
- Block-Status-Ableitung: pro Block-Key letzter `block_checkpoint.checkpoint_type` → UI-Status (`offen`, `submitted`, `reviewed`, `finalized`)
- UI-Route `/capture/new` — Button "Session starten"
- Tests fuer Server Action + Row-Level-Respect

## Out of Scope
- Questionnaire-Inhalt (SLC-005)
- Block-Submit (SLC-006)
- Exception-Mode (SLC-007)

## Acceptance
- `tenant_admin` klickt "Session starten" → Redirect auf `/capture/[sessionId]`
- Liste zeigt alle N Bloecke des Templates
- Initial-Status aller Bloecke = `offen`
- Cross-Tenant-Access blockiert (2-Tenant-Test)

## Dependencies
- SLC-001 (Schema)
- SLC-002 (Rollen)
- SLC-003 (Template-Content)

## Risks
- `template_version`-Einfrierung vergessen → spaeter In-Flight-Upgrade-Problem (Q8)
- Block-Status-Ableitung ohne Checkpoints noch trivial, wird komplex in SLC-006

## Micro-Tasks

### MT-1: Server Action startCaptureSession
- Goal: Neue Session anlegen, template_version vom aktuellen Template uebernehmen.
- Files:
  - `src/app/(app)/capture/actions.ts`
  - `src/app/(app)/capture/actions.test.ts`
- Expected behavior: `startCaptureSession({ templateSlug: 'exit_readiness' })` → INSERT capture_session mit `tenant_id = auth.user_tenant_id()`, `template_id`, `template_version`, `owner_user_id = auth.uid()`, `status = 'open'`. Gibt `sessionId` zurueck.
- Verification: Test gruen; manuell: Session-Row nach Klick sichtbar in DB.
- Dependencies: SLC-001..003

### MT-2: Route /capture/new (Trigger-UI)
- Goal: Minimal-Seite mit Template-Dropdown (in V1: nur `exit_readiness`) und Start-Button.
- Files: `src/app/(app)/capture/new/page.tsx`
- Expected behavior: Server-Component zeigt Start-Button; onClick calls Server Action, redirectet auf `/capture/[sessionId]`.
- Verification: Manuell in Browser nach Deploy.
- Dependencies: MT-1

### MT-3: Route /capture/[sessionId] (Block-Liste)
- Goal: Server-Component zeigt alle Bloecke aus dem eingefrorenen Template mit Status.
- Files:
  - `src/app/(app)/capture/[sessionId]/page.tsx`
  - `src/app/(app)/capture/[sessionId]/BlockList.tsx`
- Expected behavior: Laedt `capture_session` + `block_checkpoint`-Liste, rendert Block-Kacheln mit Titel + Status-Badge. Kein Block-Detail in diesem Slice.
- Verification: Manuell: alle Bloecke sichtbar, Status `offen`.
- Dependencies: MT-1, SLC-003

### MT-4: Cross-Tenant-Schutz-Test
- Goal: Verifizieren, dass Tenant-A-User keine Session von Tenant B sehen kann.
- Files: `src/app/(app)/capture/[sessionId]/__tests__/access.test.ts`
- Expected behavior: 2-Tenant-Seed, Request mit Tenant-A-JWT auf Session-Id von Tenant B → `notFound()` oder 404.
- Verification: `npm run test -- capture/access` gruen.
- Dependencies: MT-3

### MT-5: Status-Ableitung Helper
- Goal: Pure-Function `deriveBlockStatus(checkpoints: BlockCheckpoint[])` → `'open' | 'submitted' | 'reviewed' | 'finalized'`.
- Files:
  - `src/lib/capture/derive-block-status.ts`
  - `src/lib/capture/derive-block-status.test.ts`
- Expected behavior: Keine Checkpoints → `open`; letzter `questionnaire_submit` + keine KUs → `submitted`; mit KUs + nicht `meeting_final` → `reviewed`; letzter `meeting_final` → `finalized`.
- Verification: Unit-Test deckt alle 4 Faelle.
- Dependencies: none (pure function)

## Verification Summary
- Build + Tests gruen
- Manual: Session starten funktioniert, Block-Liste erscheint mit Status offen
- Cross-Tenant-Access blockiert
