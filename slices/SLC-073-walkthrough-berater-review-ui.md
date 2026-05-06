# SLC-073 — Walkthrough Berater-Review-UI (Cross-Tenant + Pro-Tenant + Detail + Approve/Reject)

## Status: DEFERRED (2026-05-06 per DEC-079 + DEC-091)

**SLC-073 ist deferred.** Im Zuge des V5 Option 2 Re-Plans (USP-Stress-Test 2026-05-06, DEC-079) wurde FEAT-036 (Roh-Video-Berater-Review) verworfen — Berater reviewt nicht mehr das Roh-Video, sondern die methodisch-aufbereitete SOP-Schicht. **Ersetzt durch SLC-079 (Methodik-Review-UI)** mit FEAT-040 (Subtopic-Tree + Unmapped-Bucket + Move-Pattern + Pflicht-Checkbox).

DEC-077 (Privacy-Checkbox-Pflicht) bleibt accepted und wandert architektonisch zum Methodik-Review-Approve-Pfad in SLC-079 (Re-Validation in DEC-091).

Die ursprungs Spec dieses Slices bleibt unten archiviert als historische Referenz — sie wird in keinem V5-Option-2-Slice implementiert.

---

## Goal (DEFERRED — historische Spec)

Berater-Review-UI fuer V5 Walkthrough-Mode. Drei Routen: `/admin/walkthroughs` (cross-tenant pending-Liste), `/admin/tenants/[id]/walkthroughs` (pro-Tenant), `/admin/walkthroughs/[id]` (Detail mit HTML5-video + Transkript + Pflicht-Checkbox + Approve/Reject). Server-Action `approveOrRejectWalkthrough` mit DB+Server-Side-Validation der Privacy-Checkbox + Audit-Log. Cockpit-Card "Pending Walkthroughs" auf `/admin`-Dashboard. Pattern-Reuse aus V4.1 SLC-042/043 block_review (Strukturanaloge Cross-/Per-Tenant-Sichten).

## Feature

FEAT-036 (Walkthrough Berater-Review).

## In Scope

### A — Server-Action `approveOrRejectWalkthrough`

Pfad: `src/app/actions/walkthrough.ts` (extend SLC-071-Datei)

```typescript
"use server";

export async function approveOrRejectWalkthrough(input: {
  walkthroughSessionId: string;
  decision: 'approved' | 'rejected';
  privacyCheckboxConfirmed: boolean;
  reviewerNote?: string;
  rejectionReason?: string;
}): Promise<{ ok: true }>;
```

Verhalten:
- `requireAuth()` → user. `requireRole(['strategaize_admin', 'tenant_admin'])` (kein employee/tenant_member).
- Lade `walkthrough_session` via authentifiziertem Supabase-Client (RLS-Policy `walkthrough_session_update_review` greift).
- Validiert `walkthroughSession.status === 'pending_review'`. Andere Stati → HTTP 422.
- **Pflicht-Validierung**: `decision='approved'` UND `privacyCheckboxConfirmed === true` muss erfuellt sein. Sonst HTTP 422 mit klarem Error-Message ("Privacy-Bestaetigung erforderlich"). DEC-077.
- `decision='rejected'` darf ohne Checkbox sein, aber `rejectionReason` muss non-leer sein.
- UPDATE `walkthrough_session SET`:
  - `status` = decision
  - `reviewer_user_id` = user.id
  - `reviewed_at` = now()
  - `privacy_checkbox_confirmed` = privacyCheckboxConfirmed
  - `reviewer_note` (falls gesetzt)
  - `rejection_reason` (falls decision='rejected')
- Audit-Log: `error_log` INSERT mit `category='walkthrough_review'`, `level='info'`, `metadata={ walkthrough_session_id, reviewer_user_id, decision, privacy_checkbox_confirmed }`.
- `revalidatePath('/admin/walkthroughs')` + `revalidatePath('/admin/walkthroughs/[id]')` + tenant-spezifischer Pfad.

### B — Cross-Tenant-Liste `/admin/walkthroughs/page.tsx`

Pfad: `src/app/(admin)/admin/walkthroughs/page.tsx` (neu, Server-Component).

- requireRole `strategaize_admin` ODER `tenant_admin` (tenant_admin sieht nur eigenen Tenant via RLS).
- SELECT `walkthrough_session` WHERE `status='pending_review'` ORDER BY `recorded_at ASC` (oldest first).
- JOIN `capture_session` + `tenant` + `auth.users` fuer Lesbarkeit (Tenant-Name + Mitarbeiter-Email + Capture-Session-Titel).
- Tabellen-Layout: Tenant | Mitarbeiter | Aufgenommen am | Dauer | Aktion (Link zu `/admin/walkthroughs/[id]`).
- Wenn Liste leer: Empty-State "Keine pending Walkthroughs".
- Pagination V5: einfache 50-Eintraege-Limit + "Mehr anzeigen" (V5.2: vollstaendige Pagination).

### C — Pro-Tenant-Liste `/admin/tenants/[id]/walkthroughs/page.tsx`

Pfad: `src/app/(admin)/admin/tenants/[id]/walkthroughs/page.tsx` (neu, Server-Component).

- Wie B, aber gefiltert auf `tenant_id = [id]`.
- Layout konsistent mit existing `/admin/tenants/[id]/...` Sub-Pages (V4.1 Pattern aus SLC-043 cross-tenant-reviews).
- Breadcrumb: `Tenants > <Tenant-Name> > Walkthroughs`.
- Sortierung: `recorded_at DESC` (Pro-Tenant ist Berater-Workflow-Sicht, nicht Backlog-Sicht).
- Filter-Dropdown: Status (`pending_review` default, optional `approved`, `rejected`, `failed`).

### D — Detail `/admin/walkthroughs/[id]/page.tsx`

Pfad: `src/app/(admin)/admin/walkthroughs/[id]/page.tsx` (neu, Server-Component lade-only) + `src/components/walkthroughs/WalkthroughReviewForm.tsx` (neu, Client-Component).

Server-Component:
- requireRole `strategaize_admin` oder `tenant_admin`.
- Lade `walkthrough_session` via authentifiziertem Client (RLS greift).
- 404 wenn nicht sichtbar.
- Erzeuge signed Download-URL fuer `storage_path` (15min TTL): `supabaseAdmin.storage.from('walkthroughs').createSignedUrl(storagePath, 900)`.
- Lade `knowledge_unit` via `transcript_knowledge_unit_id` (Transkript-Text fuer Anzeige).
- Render `<WalkthroughReviewForm walkthroughSessionId={...} videoUrl={...} transcript={...} status={...} />`.

Client-Component `WalkthroughReviewForm`:
- HTML5 `<video src={signedDownloadUrl} controls width="100%" />`.
- Transkript darunter in `<pre className="...">` oder `<div className="prose">` (V5: monospaced, V5.2 ggf. Markdown).
- Pflicht-Checkbox: `<Checkbox label="Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte sichtbar" checked={...} />`.
- Reviewer-Note Textarea (optional, max 500 chars).
- Rejection-Reason Textarea (Pflicht wenn Reject).
- Buttons: "Approve" (disabled solange Checkbox unchecked) + "Reject" (immer aktiv).
- Bei Klick → `approveOrRejectWalkthrough` Server-Action → Redirect zu `/admin/walkthroughs` + Toast-Confirm.
- Defense-in-Depth: Server-Action validiert ohnehin nochmal.

### E — Cockpit-Card `Pending Walkthroughs`

Pfad: `src/components/admin/cockpit/PendingWalkthroughsCard.tsx` (neu) + Einbindung in `src/app/(admin)/admin/page.tsx` (modify).

- Fetch `count(walkthrough_session WHERE status='pending_review')` scoped auf RLS (Tenant-Admin sieht eigenen Count, strategaize_admin alle).
- Card-Layout konsistent mit existing V4.1/V4.2 Cockpit-Cards (Title + grosse Zahl + Subtext + Button "Anzeigen").
- Button-Link → `/admin/walkthroughs` (cross-tenant) oder `/admin/tenants/[id]/walkthroughs` (per-Tenant, je Rolle).

### F — Tests

- `src/app/actions/__tests__/walkthrough.test.ts` (extend, +5 Cases):
  - approve happy path → Status='approved', reviewer-Felder gesetzt, error_log Eintrag.
  - approve OHNE Checkbox → HTTP 422.
  - reject happy path → Status='rejected', reviewer-Felder gesetzt, rejection_reason persistiert.
  - reject OHNE rejection_reason → HTTP 422.
  - employee/tenant_member → Forbidden (Rolle-Check).
- `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (extend, +4 UPDATE-Cases — partial, vollstaendige 16 Faelle in SLC-074):
  - strategaize_admin UPDATE auf fremder Tenant erlaubt.
  - tenant_admin UPDATE eigener Tenant erlaubt.
  - tenant_member UPDATE → Permission Denied.
  - employee UPDATE → Permission Denied.
- `src/components/walkthroughs/__tests__/WalkthroughReviewForm.test.tsx` (neu, leichtgewichtig):
  - Approve-Button disabled solange Checkbox unchecked.
  - Reject-Button aktiviert ohne Checkbox.
  - Rejection-Reason-Textarea Pflicht-Validation.

## Out of Scope

- Capture-Mode-Registry-Update (SLC-074: walkthrough als produktiver Mode in UI, walkthrough_stub raus)
- Vollstaendige RLS-Test-Matrix (SLC-074)
- Cleanup-Cron (SLC-074)
- KI-Vorschlaege fuer Approve/Reject (V5.1)
- PII-Auto-Redaction-Anzeige (V5.1)
- Reviewer-Markdown-Notes (V5.2+)
- Pagination-Standard fuer cross-tenant-Liste (V5.2)
- Re-Open-Pfad fuer rejected (V5.2+)

## Acceptance Criteria

- AC-1: Server-Action `approveOrRejectWalkthrough` exportiert in `src/app/actions/walkthrough.ts`.
- AC-2: Approve ohne Privacy-Checkbox-Confirmed schlaegt mit HTTP 422 fehl (DB+Server-Side-Validation, Defense-in-Depth).
- AC-3: Reject ohne `rejectionReason` schlaegt mit HTTP 422 fehl.
- AC-4: employee/tenant_member-Rolle wird als Reviewer abgelehnt (Forbidden).
- AC-5: Bei Approve/Reject entsteht `error_log`-Eintrag mit category='walkthrough_review' inkl. metadata.
- AC-6: `/admin/walkthroughs` (Cross-Tenant) listet pending Walkthroughs aller Tenants oldest-first (strategaize_admin) oder eigener Tenant (tenant_admin).
- AC-7: `/admin/tenants/[id]/walkthroughs` (Pro-Tenant) listet alle Walkthroughs eines Tenants mit Status-Filter.
- AC-8: `/admin/walkthroughs/[id]` zeigt HTML5-Video aus signed Download-URL (15min TTL) + Transkript-Text + Pflicht-Checkbox + Approve/Reject.
- AC-9: Approve-Button im UI disabled solange Privacy-Checkbox uncheked.
- AC-10: Cockpit-Card `Pending Walkthroughs` auf `/admin` zeigt korrekten Count, Link funktioniert (Cross-Tenant fuer strategaize_admin, Pro-Tenant fuer tenant_admin).
- AC-11: 5 Vitest-Test-Cases fuer `approveOrRejectWalkthrough` gruen.
- AC-12: 4 Vitest-RLS-UPDATE-Cases gruen (partial, vollstaendige 16 in SLC-074).
- AC-13: 3 Vitest-Component-Tests fuer `WalkthroughReviewForm` gruen.
- AC-14: `npm run lint` 0/0 + `npm run build` + `npm run test` gruen.
- AC-15: Manueller Browser-Smoke-Test (Berater-Persona, User selbst):
  - Cross-Tenant-Liste sichtbar als strategaize_admin.
  - Pro-Tenant-Liste sichtbar als strategaize_admin und tenant_admin.
  - Detail-Page laedt Video + Transkript.
  - Approve mit Checkbox setzt Status auf `approved`.
  - Reject mit Reason setzt Status auf `rejected`.

## Dependencies

- Vorbedingung: SLC-071 done (walkthrough_session-Schema + Storage-Bucket + Storage-Path).
- Vorbedingung: SLC-072 done (Whisper-Transkript ist persistiert, Status `pending_review` erreichbar).
- Pattern-Vorlage: V4.1 SLC-042 (Konsolidierter Review-View) + SLC-043 (Cross-Tenant + Pro-Tenant Reviews).
- Voraussetzung fuer SLC-074 (Registry-Update + RLS-Matrix + Cleanup).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — SLC-073 nutzt das in SLC-071 deployed Schema.

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Browser-Smoke alle 3 Routen** (cross-tenant, per-tenant, detail) auf Desktop + Mobile (analog SC-V4.2-9 Nicht-Tech-User-Smoke).
- **Pflicht-Gate: Approve mit + ohne Checkbox**, beides verifiziert.
- **Pflicht-Gate: Reject mit + ohne Reason**, beides verifiziert.
- **Pflicht-Gate: Audit-Log-Eintrag** sichtbar in `error_log` nach Approve/Reject.
- **Pflicht-Gate: Cross-Tenant-Permission-Test** als tenant_admin (sieht NUR eigenen Tenant in cross-tenant-Liste; aufgrund RLS).
- **Pflicht-Gate: Worker-Backwards-Compat** (alte Job-Types weiterhin lauffaehig).
- `npm run lint` 0/0 + `npm run build` + `npm run test`.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-073 status `done`, planning/backlog.json BL-079 → `in_progress` bleibt (FEAT-036 erst nach SLC-074 vollstaendig done).

## Risks

- **R1 — Signed-URL-TTL ablaeuft waehrend langer Review-Sessions**: Mitigation = 15min TTL + Re-Generation bei Page-Reload. Berater wird hingewiesen "Bei abgelaufenem Video Page neu laden".
- **R2 — UI-Block der Privacy-Checkbox umgehbar (z.B. via Browser-DevTools)**: Mitigation = Server-Action validiert nochmal (Defense-in-Depth, AC-2). Test verifiziert.
- **R3 — Cross-Tenant-Leak durch fehlerhafte RLS-Policy**: Mitigation = SC-V5-4 RLS-Matrix in SLC-074 16 Faelle; in SLC-073 partial 4 Faelle. Negative-Test als tenant_admin auf fremden walkthrough_session_id → 404.
- **R4 — Schwere Video-Files (300MB+) belasten Browser-Tab**: Mitigation = HTML5-video laed Streaming (range requests via Supabase-Storage). Bei 30min/300MB ist es Browser-tauglich. Test mit 25min-Aufnahme.
- **R5 — Cockpit-Card-Query laeuft bei vielen Walkthroughs langsam**: Mitigation = Partial-Index `idx_walkthrough_session_status_pending` (in SLC-071 MIG-031 schon angelegt). Query-Cost-Plan im Slice-Report dokumentieren.

### Micro-Tasks

#### MT-1: Server-Action `approveOrRejectWalkthrough`
- Goal: Server-Action in `src/app/actions/walkthrough.ts` extending SLC-071-Datei.
- Files: `src/app/actions/walkthrough.ts` (extend), `src/app/actions/__tests__/walkthrough.test.ts` (extend, +5 Cases).
- Expected behavior: Privacy-Checkbox-Pflicht bei approve, rejection_reason-Pflicht bei reject, Rollen-Check, error_log-Eintrag, revalidatePath fuer alle 3 Pfade.
- Verification: 5 Vitest-Cases (approve happy + approve no-checkbox + reject happy + reject no-reason + employee-forbidden). Live-Smoke nach MT-4.
- Dependencies: SLC-071 + SLC-072 done.
- TDD-Note: TDD-Pflicht.

#### MT-2: Cross-Tenant-Liste `/admin/walkthroughs`
- Goal: Server-Component-Page mit Tabelle, JOIN auf tenant + auth.users, Empty-State.
- Files: `src/app/(admin)/admin/walkthroughs/page.tsx` (neu).
- Expected behavior: Liste pending-Walkthroughs aller Tenants oldest-first, RLS scoped fuer tenant_admin.
- Verification: Manueller Browser-Smoke. URL-GET als strategaize_admin zeigt alle, als tenant_admin zeigt nur eigenen Tenant.
- Dependencies: MT-1 (Action-Verfuegbarkeit nicht zwingend, aber Workflow-Vollstaendigkeit).

#### MT-3: Pro-Tenant-Liste `/admin/tenants/[id]/walkthroughs`
- Goal: Server-Component-Page mit Tabelle, Status-Filter, Breadcrumb-Konsistenz mit anderen `/admin/tenants/[id]/...` Pages.
- Files: `src/app/(admin)/admin/tenants/[id]/walkthroughs/page.tsx` (neu).
- Expected behavior: Liste mit Status-Filter (default `pending_review`), Sortierung `recorded_at DESC`.
- Verification: Manueller Browser-Smoke fuer beide Rollen.
- Dependencies: MT-2 (Konsistenz-Pattern).

#### MT-4: Detail-Page + Review-Form-Component
- Goal: `/admin/walkthroughs/[id]` Server-Component + Client-Component `WalkthroughReviewForm`.
- Files: `src/app/(admin)/admin/walkthroughs/[id]/page.tsx` (neu), `src/components/walkthroughs/WalkthroughReviewForm.tsx` (neu, "use client"), `src/components/walkthroughs/__tests__/WalkthroughReviewForm.test.tsx` (neu, +3 Cases).
- Expected behavior: Video-Player, Transkript-Anzeige, Pflicht-Checkbox, Approve/Reject mit Server-Action-Call, Toast-Confirm + Redirect.
- Verification: 3 Component-Vitest-Cases + manueller Browser-Smoke (Approve-Button-Disabled-Logic, Reject-Reason-Pflicht).
- Dependencies: MT-1.

#### MT-5: Cockpit-Card `PendingWalkthroughsCard` + Einbindung in /admin
- Goal: Card-Component + COUNT-Query + Einbindung im /admin-Dashboard-Layout.
- Files: `src/components/admin/cockpit/PendingWalkthroughsCard.tsx` (neu), `src/app/(admin)/admin/page.tsx` (modify, +Card).
- Expected behavior: Card zeigt korrekten Count scoped auf RLS (Tenant-Admin sieht eigenen Count), Link funktioniert.
- Verification: Browser-Smoke beide Rollen, Count vergleicht zu manuellem `SELECT count(*) FROM walkthrough_session WHERE status='pending_review'`.
- Dependencies: MT-2.

#### MT-6: Partial-RLS-UPDATE-Tests (4 Cases)
- Goal: 4-Rollen-UPDATE-Tests gegen Live-DB (vollstaendige 16 Faelle in SLC-074).
- Files: `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (extend, +4 UPDATE-Cases).
- Expected behavior: strategaize_admin UPDATE alle, tenant_admin UPDATE eigener, tenant_member/employee UPDATE Permission Denied (SAVEPOINT-Pattern).
- Verification: `npm run test src/lib/db` gruen.
- Dependencies: MT-1.

Hinweis fuer Sequencing: MT-2 + MT-3 + MT-4 koennen parallel laufen sobald MT-1 done. MT-5 kann parallel zu MT-3/MT-4. MT-6 kann parallel zu allem.
