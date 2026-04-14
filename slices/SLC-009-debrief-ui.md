# SLC-009 — Debrief-UI + KU-Editor

- Feature: FEAT-006 (Teil 1/2)
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
`strategaize_admin` sieht pro Block eine sortierte Liste der Knowledge Units, kann sie editieren, ergaenzen, akzeptieren oder ablehnen. Jede Aktion erzeugt einen `validation_layer`-Eintrag (Audit-Trail).

## In Scope
- Route `/debrief/[sessionId]/[blockKey]` — Server-Component, Cross-Tenant-lesbar fuer `strategaize_admin`
- KU-Liste mit Confidence-Badges + Source-Markierung (questionnaire / exception / ai_draft)
- KU-Editor: Titel + Body editierbar, Status-Buttons (`accept`, `edit`, `reject`)
- "KU hinzufuegen"-Button (strategaize_admin kann ergaenzen)
- Server Actions `updateKnowledgeUnit(kuId, patch)`, `addKnowledgeUnit(sessionId, blockKey, kuData)`
- Validation-Layer-Write bei jedem Status-Wechsel / Edit
- Sichtbarkeit: Auf Block-Liste (SLC-004) taucht `reviewed`-Status auf, sobald >= 1 KU existiert

## Out of Scope
- Meeting-Snapshot (SLC-010)
- PDF-Export (V1 nur JSON, SLC-010)
- Diff-View (V2+)

## Acceptance
- `strategaize_admin` oeffnet `/debrief/[sid]/[bk]` → sieht KUs mit Status
- Edit einer KU → Row im `validation_layer` mit `action=edit`, `previous_status`, `new_status`
- Accept-Klick → KU-Status `accepted`, Validation-Row, UI-Feedback
- `tenant_admin` kann die Seite NICHT oeffnen (403 / notFound)
- Tests gruen inkl. RLS-Admin-Policy-Test

## Dependencies
- SLC-001..008

## Risks
- Optimistic-UI vs. Validation-Layer-Konsistenz: bei Fehler Rollback im UI
- Viele KUs pro Block → UX (V1: simple List, V2+: Gruppen/Sortierung)

## Micro-Tasks

### MT-1: Debrief-Route + KU-Liste
- Goal: Server-Component, die KUs + Validation-Layer laedt.
- Files:
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/page.tsx`
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/KnowledgeUnitList.tsx`
- Expected behavior: Laedt KUs sortiert nach `created_at ASC`, gruppiert nach `source`. Zeigt Badges (confidence + source).
- Verification: Manuell; grep ensures Admin-only middleware greift.
- Dependencies: SLC-008 (KUs existieren)

### MT-2: Server Action updateKnowledgeUnit
- Goal: Single-Row-Update + Validation-Row.
- Files:
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/actions.ts`
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/actions.test.ts`
- Expected behavior: UPDATE `knowledge_unit` (body/title/status) + INSERT `validation_layer` (action, previous_status, new_status, reviewer_user_id, reviewer_role). Atomic via RPC `rpc_update_knowledge_unit_with_audit`.
- Verification: Tests fuer happy + permission + validation-row-created.
- Dependencies: MT-1

### MT-3: Migration 033 — RPC update_with_audit
- Goal: Atomar KU-Update + Validation-Row.
- Files: `sql/migrations/033_rpc_update_knowledge_unit_with_audit.sql`
- Expected behavior: `rpc_update_knowledge_unit_with_audit(p_ku_id, p_patch jsonb, p_action text, p_note text)` → uuid (validation_layer.id). SECURITY DEFINER, prueft Rolle `strategaize_admin`.
- Verification: Manuell `SELECT rpc_update_knowledge_unit_with_audit(...)`.
- Dependencies: SLC-001

### MT-4: KU-Editor-Komponente
- Goal: Formular fuer Titel + Body + Status-Buttons.
- Files: `src/app/(admin)/debrief/[sessionId]/[blockKey]/KnowledgeUnitEditor.tsx`
- Expected behavior: Inline-Edit mit Save/Cancel; Accept/Reject/Edit-Buttons triggern Action.
- Verification: Manuell.
- Dependencies: MT-1, MT-2

### MT-5: Add-KU-Dialog
- Goal: Admin kann eigenen KU-Eintrag ergaenzen.
- Files:
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/AddKnowledgeUnitDialog.tsx`
  - Server Action `addKnowledgeUnit` in `actions.ts` (erweitern)
- Expected behavior: Neue KU mit `source = 'ai_draft'`? Oder eigenem Source-Type `manual`? **Entscheidung**: `source = 'manual'` + DEC-013 in DECISIONS.md.
- Verification: Manuell + Test.
- Dependencies: MT-2

### MT-6: Admin-Access-Guard
- Goal: Middleware/Layout blockiert `tenant_admin` / `tenant_member`.
- Files:
  - `src/app/(admin)/layout.tsx`
  - `src/app/(admin)/debrief/[sessionId]/[blockKey]/__tests__/access.test.ts`
- Expected behavior: `strategaize_admin` sieht Seite; andere Rollen → 404/403.
- Verification: Test mit 3 Rollen.
- Dependencies: MT-1

### MT-7: RLS-Admin-Policy-Test
- Goal: Verifiziere, dass `strategaize_admin` Cross-Tenant KUs lesen kann.
- Files: `src/lib/db/__tests__/admin-rls.test.ts`
- Expected behavior: Seed 2 Tenants mit je 1 KU; als `strategaize_admin` beide Rows sichtbar; als `tenant_admin` nur eigene.
- Verification: `npm run test -- admin-rls` gruen.
- Dependencies: SLC-001

## Verification Summary
- Build + Tests gruen
- Manual: Edit/Accept/Reject funktioniert, Validation-Layer waechst
- Cross-Tenant-Admin-Read funktioniert, Tenant-User gesperrt
