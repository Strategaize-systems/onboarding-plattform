# SLC-079 — Walkthrough Methodik-Review-UI (FEAT-040)

## Goal

Methodik-Review-UI fuer Berater (Strategaize-Admin + Tenant-Admin) ueber pending_review Walkthroughs. Drei Admin-Routen ersetzen die deferred FEAT-036-Routen: `/admin/walkthroughs` (cross-tenant Liste), `/admin/tenants/[id]/walkthroughs` (per-tenant Liste), `/admin/walkthroughs/[id]` (Detail mit Subtopic-Tree). Detail-View rendert `<SubtopicTreeReview>` (Pattern-Reuse FEAT-023 Bridge-Review-UI in Reverse-Direction) mit zugeordneten walkthrough_step pro Subtopic, daneben `<UnmappedBucket>` mit Schritten ohne Mapping (subtopic_id IS NULL). Berater nutzt Select-Move-Dropdown (DEC-086) fuer Mapping-Korrektur. Confidence-Ampel (DEC-087) zeigt gruen/gelb/rot pro Schritt. Approve-Form mit Pflicht-Privacy-Checkbox (Re-Validation DEC-077 → DEC-090) blockt Approve bis aktiv. Optional `<RawTranscriptToggle>` (DEC-088) zeigt Original-Transkript on-demand und loggt Aktivierung als 1 error_log-Eintrag pro Toggle. Cockpit-Card "Pending Walkthroughs" auf Berater-Sicht analog V4.1 SLC-042 block_review.

## Feature

FEAT-040 (Walkthrough Methodik-Review-UI) — ersetzt deferred FEAT-036. Pattern-Reuse: V4 FEAT-023 Bridge-Review-UI (SLC-035 + SLC-036) + V4.1 FEAT-029 block_review (SLC-041 + SLC-042 + SLC-043).

## In Scope

### A — 3 Admin-Routen

| Route | Rollen | Inhalt |
|-------|--------|--------|
| `/admin/walkthroughs` (page.tsx, Server Component) | strategaize_admin | Cross-Tenant-Liste, oldest-first, Tabelle: tenant.name, recorded_by, created_at, mapping-Stats (mapped/unmapped Count). |
| `/admin/tenants/[id]/walkthroughs` (page.tsx) | strategaize_admin + tenant_admin (own tenant) | Per-Tenant-Liste, gleiche Tabelle ohne tenant.name-Spalte. |
| `/admin/walkthroughs/[id]` (page.tsx) | strategaize_admin + tenant_admin (own tenant) | Detail-View mit Subtopic-Tree + Unmapped-Bucket + ApprovalForm + RawTranscriptToggle. |

Server-side Auth-Guards: `requireRole(['strategaize_admin','tenant_admin'])` (existing pattern aus V4.1).

### B — Detail-View Komponentenbaum

```tsx
// /admin/walkthroughs/[id]/page.tsx
<WalkthroughHeader walkthroughSession={ws} />          {/* Metadaten */}
<SubtopicTreeReview                                    {/* Pattern-Reuse FEAT-023 BridgeReviewTree */}
  template={template}
  mappings={mappings}
  steps={steps}
  onMove={moveWalkthroughStepMapping}
  onEdit={editWalkthroughStep}
  onDelete={softDeleteWalkthroughStep}
/>
<UnmappedBucket
  steps={unmappedSteps}
  mappings={unmappedMappings}
  subtopicOptions={flatSubtopicTree}
  onMoveTo={moveWalkthroughStepMapping}
/>
<RawTranscriptToggle
  walkthroughSessionId={ws.id}
  redactedKuId={redactedKu.id}
  originalKuId={originalKu.id}
  onToggle={logRawTranscriptView}
/>
<ApprovalForm
  walkthroughSessionId={ws.id}
  onApprove={approveOrRejectWalkthroughMethodology}
  onReject={approveOrRejectWalkthroughMethodology}
/>
```

### C — Komponenten

Pfade unter `src/components/admin/walkthroughs/` (neu):

- **`SubtopicTreeReview.tsx`**: Tree-Render der template.blocks[].subtopics[]. Pro Subtopic-Knoten Liste der zugeordneten walkthrough_step (mappings WHERE subtopic_id=node.id). Pro Schritt: action-Text + responsible/timeframe-Meta + Confidence-Pille (gruen/gelb/rot ausgelesen aus `mapping.confidence_band`). Pro Schritt Buttons: "Verschieben" (oeffnet MoveStepDropdown), "Editieren" (Inline-Form), "Loeschen" (Soft-Delete-Confirm).
- **`UnmappedBucket.tsx`**: Liste aller mappings WHERE subtopic_id IS NULL. Pro Eintrag: action + responsible + Confidence-Pille (rot per DEC-087) + MoveStepDropdown.
- **`MoveStepDropdown.tsx`**: Inline-Dropdown mit flat-Tree-Liste der Subtopics ("Block 1 / Subtopic A", ...). Klick triggert `moveWalkthroughStepMapping({stepId, newSubtopicId|null})`. Loading-Spinner waehrend Server-Action laeuft.
- **`StepEditForm.tsx`**: Inline-Form fuer action / responsible / timeframe / success_criterion / dependencies. Save triggert `editWalkthroughStep`.
- **`RawTranscriptToggle.tsx`**: Client Component mit useState toggle. On-Aktivierung: `logRawTranscriptView`-Server-Action (1 error_log-Eintrag). Render: pre-formatierter Original-Transkript-Text (lange Liste, scrollbar). Default off; Page-Reload setzt off zurueck.
- **`ApprovalForm.tsx`**: Pflicht-Checkbox "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte in den extrahierten SOPs sichtbar". Approve-Button disabled bis aktiv. Reject-Button mit optionalem Reason-Textarea. Submit triggert `approveOrRejectWalkthroughMethodology`.
- **`ConfidenceBadge.tsx`**: Pille mit Tailwind-Konvention `bg-green-100 text-green-800` / `bg-yellow-100 text-yellow-800` / `bg-red-100 text-red-800`. Tooltip on-hover zeigt numerischen Score + mapping_reasoning.
- **`PendingWalkthroughsCard.tsx`** (Cockpit-Card auf `/admin` und `/dashboard`): Zaehlt pending_review walkthrough_sessions, Link auf Liste.

### D — Server Actions

Pfad: `src/app/actions/walkthrough-methodology.ts` (neu).

```typescript
"use server";

export async function moveWalkthroughStepMapping(input: {
  walkthroughStepId: string;
  newSubtopicId: string | null;
}): Promise<void>;

export async function editWalkthroughStep(input: {
  walkthroughStepId: string;
  patches: Partial<{ action, responsible, timeframe, success_criterion, dependencies }>;
}): Promise<void>;

export async function softDeleteWalkthroughStep(input: {
  walkthroughStepId: string;
}): Promise<void>;

export async function approveOrRejectWalkthroughMethodology(input: {
  walkthroughSessionId: string;
  decision: 'approved' | 'rejected';
  privacyCheckboxConfirmed: boolean;
  reviewerNote?: string;
  rejectionReason?: string;
}): Promise<void>;

export async function logRawTranscriptView(input: {
  walkthroughSessionId: string;
}): Promise<void>;
```

Validation pro Action:
- `moveWalkthroughStepMapping`: Berater-Rolle (strategaize_admin | tenant_admin same tenant), UPDATE walkthrough_review_mapping SET subtopic_id, reviewer_corrected=true, reviewer_user_id=auth.uid(), reviewed_at=now(). GENERATED-Column rechnet confidence_band neu.
- `editWalkthroughStep`: Berater-Rolle, UPDATE walkthrough_step SET ..., edited_by_user_id, edited_at.
- `softDeleteWalkthroughStep`: Berater-Rolle, UPDATE walkthrough_step SET deleted_at=now().
- `approveOrRejectWalkthroughMethodology`: walkthroughSession.status='pending_review' Pflicht; decision='approved' verlangt privacyCheckboxConfirmed=true (HTTP 422 sonst); UPDATE walkthrough_session.status, reviewer_user_id, reviewed_at, privacy_checkbox_confirmed=true, reviewer_note OR rejection_reason; error_log mit category='walkthrough_methodology_review'.
- `logRawTranscriptView`: error_log INSERT (category='walkthrough_raw_transcript_view', user_id, walkthrough_session_id, message='Roh-Transkript aktiviert').

### E — Cockpit-Card "Pending Walkthroughs"

Pfad: `src/components/dashboard/PendingWalkthroughsCard.tsx` (neu) + Integration in `/admin/page.tsx` und ggf. `/dashboard/page.tsx`.

- Server Component (page-refresh-only, kein Polling — DEC-060).
- Counts: cross-tenant fuer strategaize_admin, own-tenant fuer tenant_admin.
- Link auf `/admin/walkthroughs` bzw. `/admin/tenants/[id]/walkthroughs`.

## Micro-Tasks

### MT-1: Server Actions `walkthrough-methodology.ts`
- Goal: 5 Server Actions implementiert + Auth-Guards + Audit-Log.
- Files: `src/app/actions/walkthrough-methodology.ts` (neu), `src/lib/auth/requireRole.ts` (modify wenn nicht existing).
- Expected behavior: Actions liefern void/throw HTTP-Errors korrekt, RLS-Guard via service_role-fallback fuer cross-tenant strategaize_admin.
- Verification: Vitest mit 5 Test-Faellen pro Action (Happy + Auth-Reject + Validation-Reject).
- Dependencies: SLC-076 + SLC-077 + SLC-078 (Schemas live)

### MT-2: ConfidenceBadge + MoveStepDropdown + StepEditForm + RawTranscriptToggle
- Goal: 4 Bauteil-Komponenten.
- Files: `src/components/admin/walkthroughs/ConfidenceBadge.tsx`, `MoveStepDropdown.tsx`, `StepEditForm.tsx`, `RawTranscriptToggle.tsx` (alle neu).
- Expected behavior: Komponenten rendern + triggern korrekte Server Actions.
- Verification: Storybook-Snapshot oder Vitest-Component-Test.
- Dependencies: MT-1

### MT-3: SubtopicTreeReview + UnmappedBucket
- Goal: Tree-Render + Bucket-Render.
- Files: `src/components/admin/walkthroughs/SubtopicTreeReview.tsx`, `UnmappedBucket.tsx` (neu).
- Expected behavior: Subtopics geschachtelt, walkthrough_step pro Subtopic gerendert, Move-Dropdown integriert. Unmapped-Bucket separat unterhalb des Trees.
- Verification: Vitest-Component-Test mit Mock-Template + Mock-Mappings + Mock-Steps.
- Dependencies: MT-2

### MT-4: Admin-Routen `/admin/walkthroughs` + `/admin/tenants/[id]/walkthroughs`
- Goal: 2 Liste-Routen.
- Files: `src/app/admin/walkthroughs/page.tsx`, `src/app/admin/tenants/[id]/walkthroughs/page.tsx` (neu).
- Expected behavior: Liste rendert pending_review + approved/rejected mit Filter-Toggle, oldest-first, mapping-Stats.
- Verification: Browser-Test auf Live-URL fuer beide Routen mit Test-Daten.
- Dependencies: SLC-076 + SLC-077 + SLC-078 (Daten existieren)

### MT-5: Detail-Route `/admin/walkthroughs/[id]`
- Goal: Detail-Page mit allen Komponenten verdrahtet.
- Files: `src/app/admin/walkthroughs/[id]/page.tsx` (neu), `WalkthroughHeader.tsx`, `ApprovalForm.tsx` (neu).
- Expected behavior: Page laedt walkthroughSession + steps + mappings + redacted-KU + originalKu + template, rendert SubtopicTreeReview + UnmappedBucket + RawTranscriptToggle + ApprovalForm.
- Verification: Browser-Smoke mit echtem pending_review-Walkthrough — Tree-Render OK, Move-Klick aendert Mapping in DB, Approve mit Checkbox OK, Approve ohne Checkbox blockiert.
- Dependencies: MT-1, MT-2, MT-3

### MT-6: Cockpit-Card PendingWalkthroughsCard
- Goal: Cockpit-Card auf Admin- und Dashboard-Sicht.
- Files: `src/components/dashboard/PendingWalkthroughsCard.tsx` (neu), `src/app/admin/page.tsx` (modify), `src/app/dashboard/page.tsx` (modify wenn relevant).
- Expected behavior: Card zeigt Count + Link, refresht bei Page-Reload.
- Verification: Browser-Test, Count gegen DB-Query verifiziert.
- Dependencies: MT-4

### MT-7: Browser-Smoke + SC-V5-4 Berater-Methodik-Review-Smoke
- Goal: Berater-Walkthrough alle 3 Admin-Routen end-to-end.
- Files: keine (Test-Dokumentation in RPT-Slice-Report).
- Expected behavior: User-Smoke (richard@bellaerts.de in tenant_admin-Rolle) auf Live-URL: /admin/walkthroughs Liste → /admin/tenants/[id]/walkthroughs → /admin/walkthroughs/[id] Detail → Move-Step → Approve mit Checkbox → status='approved'. Plus Reject ohne Reason-Test, Approve-ohne-Checkbox-Block-Test.
- Verification: Screenshot-Beleg pro Schritt + status-Verlauf in DB.
- Dependencies: MT-5, MT-6

## Out of Scope

- Polling-UI fuer Pipeline-Stage-Updates → manueller Refresh (DEC-060).
- Bulk-Approve mehrerer Walkthroughs → V5.x.
- Berater-Notizen pro Schritt → V5.x (BL-082-Adjacent).
- Re-Open rejected Walkthrough → V5.2+.
- Drag-Drop Move-Pattern → ausgeschlossen per DEC-086 (Select-Move).
- KU-Bruecke beim Approve → V5.1 FEAT-038 (DEC-090).

## Risks / Mitigations

- **R1 — Subtopic-Tree dangling subtopic_id nach Template-Update**: UI muss tolerant rendern ("Subtopic nicht mehr verfuegbar" + Re-Mapping anbieten). Test-Fixture mit dangling-Subtopic in MT-3.
- **R2 — Move-Action Race-Condition**: Zwei Berater editieren gleiches Mapping. Last-Write-Wins akzeptabel (kein Conflict-Resolution in V5). updated_at-Spalte ermoeglicht spaeteres Audit.
- **R3 — Cockpit-Card-Performance**: count-Query pro Tenant. Cache via React Server-Component-Caching reicht; bei realer Last (>50 pending) ist DB-Indexed-Query (existing index auf walkthrough_session.status) ausreichend.

## Verification

- `npm run lint` 0/0.
- `npm run build` ohne Fehler.
- `npm run test` PASS (eingeschlossen 5 Action-Tests + Component-Tests).
- Browser-Smoke MT-7 alle drei Routen + Approve mit/ohne Checkbox + Reject mit/ohne Reason — Screenshots als Slice-Report-Beleg.
- DB-Query-Verifikation: nach Approve-Click → walkthrough_session.status='approved', privacy_checkbox_confirmed=true, reviewer_user_id=auth.uid(), reviewed_at gesetzt.

## Pflicht-Gates

- **SC-V5-4 Berater-Methodik-Review-Smoke** alle 3 Routen + Move + Approve mit/ohne Checkbox.
- Pattern-Reuse FEAT-023 + FEAT-029 sichtbar (Diff gegen BridgeReviewTree + BlockReviewView dokumentieren).
- Pflicht-Privacy-Checkbox (DEC-091, Re-Validation DEC-077): Approve ohne Checkbox = HTTP 422.
- Roh-Transkript-Toggle Audit-Log: 1 Eintrag pro Toggle-Aktivierung (DEC-088).
- Cross-Tenant-RLS: tenant_admin sieht NUR eigenen Tenant in /admin/tenants/[id]/walkthroughs (Test in MT-4).

## Status

planned

## Created

2026-05-06
