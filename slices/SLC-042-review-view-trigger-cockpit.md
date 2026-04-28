# SLC-042 — Konsolidierter Review-View + Trigger-Quality-Gate-Dialog + Cockpit-Card

## Goal
Drei zusammenhaengende Frontend-Bausteine als Berater-Workflow-Frontend: (1) Konsolidierter Block-zentrierter Review-View `/admin/blocks/[blockKey]/review` fuer strategaize_admin, (2) Quality-Gate-Confirm-Dialog im bestehenden TriggerHandbookButton (DEC-045 weiches Gate), (3) Cockpit-Card "Mitarbeiter-Bloecke reviewed" auf `/dashboard`. Alle UI-Aktionen rufen die in SLC-041 gebauten Server-Actions.

## Feature
FEAT-029 (Berater-Review + Quality-Gate) — Frontend-Anteil

## In Scope

### A — Konsolidierter Review-View
- Route `src/app/admin/blocks/[blockKey]/review/page.tsx` (Server-Component):
  - URL-Pattern: `/admin/blocks/[blockKey]/review?tenant=...&session=...`
  - strategaize_admin-Check via Layout-Middleware oder explizit
  - Laedt:
    - `tenants(name)` + Block-Titel aus `template.blocks` per `block_key`
    - Alle KUs mit `source='employee_questionnaire'` fuer `(tenant_id, capture_session_id, block_key)`
    - Mitarbeiter-Lookup je KU: aus `capture_session.created_by` -> `profiles.full_name + email`
    - Aktueller `block_review` Status + Audit-Felder
- Layout (Block-zentriert, DEC-046):
  - Header: Tenant-Name + Block-Titel + Anzahl Mitarbeiter-KUs + aktueller Status-Badge (pending/approved/rejected)
  - Hauptbereich: Liste der Mitarbeiter-KUs gestapelt
    - Pro KU: Mitarbeiter (Name + E-Mail), Confidence-Indikator, KU-Title + KU-Content
    - Optional: Link zur Capture-Session des Mitarbeiters
  - Footer-Aktion: Approve-Button + Reject-Button
  - History-Anzeige (read-only): "Letzter Reviewer: [name] am [datum] mit Notiz: [...]" wenn Audit-Felder gesetzt
- UI-Components:
  - `src/components/review/BlockReviewHeader.tsx`
  - `src/components/review/EmployeeKUStack.tsx` (KU-Liste mit Mitarbeiter-Source)
  - `src/components/review/ApproveRejectButtons.tsx` (mit Approve-Modal-Trigger)
- Approve-Modal (shadcn `Dialog`):
  - Optional Note-Textarea
  - Bestaetigt → ruft `approveBlockReview` Server-Action (aus SLC-041)
  - Toast-Feedback bei Erfolg
- Reject analog

### B — Quality-Gate-Confirm-Dialog
- Aenderung in `src/app/admin/handbook/TriggerHandbookButton.tsx`:
  - Neue Logik: vor Trigger-Server-Action `getReviewSummary(tenantId, sessionId)` aufrufen (aus SLC-041)
  - Wenn `pending > 0`:
    - shadcn `AlertDialog` (oder Dialog) anzeigen mit Text:
      - "X von Y Mitarbeiter-Bloecken sind reviewed."
      - "K Bloecke werden NICHT ins Handbuch fliessen."
      - "Trotzdem generieren?"
    - Bestaetigung → ruft Trigger mit Audit-Field `pending_at_trigger: K`
    - Abbruch → schliesst Dialog, kein Trigger
  - Wenn `pending === 0`: direkter Trigger ohne Dialog (V4-Verhalten)
- Audit-Log via existierendem `logger.info` mit `{ snapshot_id, pending_blocks_at_trigger: K, approved_blocks: M, rejected_blocks: J }`

### C — Cockpit-Card "Mitarbeiter-Bloecke reviewed"
- Neue Component `src/components/cockpit/BlockReviewStatusCard.tsx`:
  - Server-Component
  - Laedt via `getReviewSummary(tenantId, sessionId)`
  - Anzeige: "X / Y Mitarbeiter-Bloecke reviewed" + Status-Indikator (gruen wenn 100%, gelb sonst)
  - Klickbar:
    - tenant_admin: linkt zu read-only Tenant-Sicht `/dashboard/reviews` (NEUE leichte Sub-Page, read-only Liste der Reviews-Status pro Block)
    - strategaize_admin: linkt zu `/admin/tenants/[tenantId]/reviews` (kommt in SLC-043, Linkziel kann jetzt schon stehen)
- Integration in `src/app/dashboard/page.tsx`:
  - Card als 6. MetricCard (oder alternatives Layout — siehe Q-V4.1-H, Architektur empfiehlt eigene Card)
- Read-only Tenant-Reviews-Sub-Page `/dashboard/reviews`:
  - Server-Component, listet `block_review`-Eintraege fuer eigenen Tenant mit Status pro Block (read-only, kein Approve)
  - Nutzt RLS — tenant_admin sieht nur eigenen Tenant

### D — Audit-Log-Pfad
- Bei jedem Snapshot-Trigger via TriggerHandbookButton wird ein info-Eintrag in `error_log` (oder existierendes Logging-Pattern) geschrieben mit Severity `info` und Payload `{ snapshot_id, pending_at_trigger, approved_count, rejected_count }`. Reuse existierendes `logger.info`-Pattern aus V4.

## Out of Scope
- Cross-Tenant `/admin/reviews` Page (SLC-043)
- Pro-Tenant `/admin/tenants/[id]/reviews` Page (SLC-043)
- Quick-Stats-Badge in `/admin/tenants` Tabellen-Eintrag (SLC-043)
- Reader-Page `/dashboard/handbook/[snapshotId]` (SLC-044)
- KU-granulares Override-UI (V4.2+)
- Bulk-Approve ueber mehrere Bloecke (V4.2+)
- Multi-stufiger Approval-Workflow (V4.2+)

## Acceptance Criteria
- AC-1: `strategaize_admin` ruft `/admin/blocks/[blockKey]/review?tenant=A&session=B` auf und sieht Block-Header mit Tenant-Name + Block-Titel + KU-Count.
- AC-2: Mitarbeiter-KUs sind gestapelt sichtbar mit Mitarbeiter-Name + E-Mail + Confidence + KU-Inhalt.
- AC-3: Approve-Button klick → Modal mit Note-Field → Bestaetigung → Server-Action laeuft, Toast "Block approved", Status-Badge wechselt auf approved.
- AC-4: Reject-Button analog mit Status-Wechsel auf rejected.
- AC-5: History-Anzeige zeigt nach Approve den letzten Reviewer + Zeitpunkt + Notiz.
- AC-6: tenant_admin bekommt 403/Redirect bei Aufruf der Review-Page.
- AC-7: TriggerHandbookButton zeigt Confirm-Dialog wenn `pending > 0`. Dialog-Text enthaelt korrekte X/Y-Zahlen.
- AC-8: Bestaetigung im Confirm-Dialog triggert Snapshot mit Audit-Field `pending_at_trigger`.
- AC-9: Wenn `pending === 0`: kein Dialog, direkter Trigger (V4-Verhalten unveraendert).
- AC-10: Cockpit-Card "Mitarbeiter-Bloecke reviewed" zeigt korrekten X/Y-Stand aus `getReviewSummary`.
- AC-11: Card-Klick fuer tenant_admin fuehrt zu `/dashboard/reviews` (read-only).
- AC-12: Card-Klick fuer strategaize_admin fuehrt zu `/admin/tenants/[id]/reviews` (Link funktioniert auch wenn die Page noch nicht in SLC-043 gebaut ist — 404 ist akzeptabel bis SLC-043 done).
- AC-13: `/dashboard/reviews` zeigt Block-Status read-only fuer eigenen Tenant.
- AC-14: `npm run build` + `npm run test` gruen.
- AC-15: Responsive: Review-View und Cockpit-Card brechen auf mobile sauber.

## Dependencies
- Vorbedingung: SLC-041 done (Schema + Server-Actions + getReviewSummary verfuegbar).
- Nachgelagerter Slice: SLC-043 (Cross-Tenant + Pro-Tenant Reviews-Sichten — die Cockpit-Card-Links profitieren davon).

## Worktree
Mandatory (SaaS).

## Migrations-Zuordnung
Keine Migration in diesem Slice (alle in SLC-041 enthalten).

## Pflicht-QA-Vorgaben
- Cross-Rollen-Verifikation: tenant_admin bekommt 403 bei Review-Page, sieht nur read-only Reviews-Sub-Page.
- E2E-Smoke: Approve-Flow von Review-View bis Cockpit-Card-Update verifiziert.
- Quality-Gate-Dialog-Verifikation: Trigger mit pending=0 ohne Dialog, mit pending>0 mit Dialog.
- Audit-Log-Eintrag pro Trigger sichtbar in `error_log`.
- Responsive-Check.
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.
- Cockpit-Records-Update nach Slice-Ende (mandatory).

## Risks
- **R1 — Mitarbeiter-Lookup-Performance:** `capture_session.created_by` -> `profiles.full_name` Join koennte bei vielen KUs N+1 werden. Mitigation: Lookup als Single-Query mit IN-Clause + Map.
- **R2 — Confirm-Dialog-UX-Reibung:** Berater muss bei jedem Trigger mit pending>0 bestaetigen. Mitigation: weicher Mode (DEC-045) ist bewusst — Berater-Hoheit bleibt erhalten.
- **R3 — Cockpit-Card-Link auf SLC-043-Page bevor diese existiert:** Mitigation: Link funktioniert; 404 in der Zwischenzeit akzeptabel (SLC-042 + SLC-043 koennen parallel oder direkt nacheinander released werden).

### Micro-Tasks

#### MT-1: Konsolidierter Review-View Page + Server-Component
- Goal: `/admin/blocks/[blockKey]/review/page.tsx` mit Block-Header + Mitarbeiter-KU-Stack.
- Files: `src/app/admin/blocks/[blockKey]/review/page.tsx` (neu), `src/components/review/BlockReviewHeader.tsx` (neu), `src/components/review/EmployeeKUStack.tsx` (neu)
- Expected behavior: Server-Component laedt alle relevanten Daten, rendert Header + KU-Liste, History-Anzeige unten.
- Verification: Browser-Test mit Demo-Tenant, alle Daten korrekt sichtbar.
- Dependencies: SLC-041 done

#### MT-2: Approve/Reject Buttons + Modal
- Goal: ApproveRejectButtons-Component mit Modal fuer Note-Eingabe.
- Files: `src/components/review/ApproveRejectButtons.tsx` (neu), `src/components/review/ApproveModal.tsx` (neu)
- Expected behavior: Buttons rufen approveBlockReview/rejectBlockReview Server-Actions, Toast-Feedback, Status-Update via revalidatePath.
- Verification: Browser-E2E (Klick Approve → Modal → Confirm → Status-Wechsel sichtbar).
- Dependencies: MT-1, SLC-041 MT-3 (Server-Actions)

#### MT-3: TriggerHandbookButton Confirm-Dialog erweitern
- Goal: AlertDialog im TriggerHandbookButton mit X/Y-Anzeige und Audit-Logging.
- Files: `src/app/admin/handbook/TriggerHandbookButton.tsx` (geaendert), `src/app/admin/handbook/__tests__/TriggerHandbookButton.test.tsx` (neu oder erweitert)
- Expected behavior: pre-Trigger getReviewSummary, bei pending>0 AlertDialog, bei Bestaetigung Trigger mit Audit-Field.
- Verification: 3 Test-Cases (pending=0 → kein Dialog, pending>0 → Dialog → Confirm → Trigger; Cancel → kein Trigger). `npm run test src/app/admin/handbook` gruen.
- Dependencies: SLC-041 MT-3 (getReviewSummary)

#### MT-4: BlockReviewStatusCard Cockpit-Component + Integration
- Goal: Neue Cockpit-Card + Integration in `/dashboard/page.tsx` als 6. MetricCard.
- Files: `src/components/cockpit/BlockReviewStatusCard.tsx` (neu), `src/app/dashboard/page.tsx` (geaendert), `src/components/cockpit/__tests__/BlockReviewStatusCard.test.tsx` (neu)
- Expected behavior: Card laedt getReviewSummary, zeigt X/Y + Status-Badge + Link je nach Rolle.
- Verification: Browser-Test in beiden Rollen-Sichten (tenant_admin link auf /dashboard/reviews, strategaize_admin link auf /admin/tenants/[id]/reviews).
- Dependencies: SLC-041 MT-3

#### MT-5: Read-only Tenant-Reviews-Sub-Page `/dashboard/reviews`
- Goal: Tenant-eigene Read-only Reviews-Status-Page.
- Files: `src/app/dashboard/reviews/page.tsx` (neu), `src/components/cockpit/TenantReviewsList.tsx` (neu)
- Expected behavior: Server-Component listet `block_review`-Eintraege gefiltert auf eigenen Tenant via RLS, read-only Status-Anzeige pro Block.
- Verification: Browser-Test als tenant_admin (sieht nur eigene Reviews), als tenant_member (403/Redirect).
- Dependencies: SLC-041 done
