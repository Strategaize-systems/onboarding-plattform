# SLC-071 — Walkthrough Foundation: MIG-031 + Capture-UI + Direct-Upload

## Status-Anmerkung (V5 Option 2)

Code-side **done** (Commit ebb3eaf, RPT-169 PASS code-side). MIG-031 (082+083+084) live appliziert. Browser-Smoke AC-10/11/12 wurde wegen 404-RLS-Issue (Q-V5-F) blockiert — **architektonisch geloest in DEC-080 Self-Spawn-Pattern**.

**Slice-Closing-Entscheidung 2026-05-06 in /slice-planning V5 Option 2:** SLC-071 bleibt als-ist akzeptiert (Code unveraendert verwertbar). Der Routing-Patch wird als eigener Folge-Slice `SLC-075 — Walkthrough Routing-Patch + Self-Spawn-Pattern` eingefuehrt (loest BL-086 + erlaubt AC-10/11/12 Browser-Smoke nachzuholen). Status SLC-071 bleibt `in_progress` bis SLC-075 abgeschlossen ist; danach `done`.

WalkthroughCapture.tsx, requestWalkthroughUpload, confirmWalkthroughUploaded bleiben funktional unveraendert — nur Routing-Wrapper aendert sich in SLC-075.

## Goal

Backend-Foundation und Capture-Pfad fuer V5 Walkthrough-Mode. MIG-031 (Migrations 082+083+084) auf Hetzner deployen — alle V5-Schema-Aenderungen + Storage-Bucket upfront. Capture-UI unter `/employee/capture/walkthrough/[id]` mit `getDisplayMedia` + `getUserMedia`, MediaRecorder (`video/webm;codecs=vp9,opus`), 30min-Hard-Cap (Browser-Timer), Direct-Upload via Supabase Signed URL. Zwei Server Actions: `requestWalkthroughUpload` (erzeugt walkthrough_session + signed URL) und `confirmWalkthroughUploaded` (status=uploaded + queued ai_jobs-Eintrag fuer SLC-072 Worker). Status-Polling-Page als End-State.

## Feature

FEAT-034 (Walkthrough Capture-Session) — Backend-Foundation + Capture-UI + Direct-Upload-Pfad. Teil-FEAT-035 (ai_jobs-Queueing als Schnittstelle fuer SLC-072).

## In Scope

### A — MIG-031 / sql/migrations/082+083+084

Drei Files, **strikt sequentiell deployed** (082 → 083 → 084), jeder idempotent.

**082_v5_walkthrough_capture_mode.sql** — CHECK-Erweiterungen
```sql
ALTER TABLE public.capture_session
  DROP CONSTRAINT IF EXISTS capture_session_capture_mode_check;
ALTER TABLE public.capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire', 'evidence', 'dialogue',
    'employee_questionnaire', 'walkthrough_stub',
    'walkthrough'
  ));

ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;
ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    'questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual',
    'evidence', 'dialogue', 'employee_questionnaire',
    'walkthrough_transcript'
  ));
```

**083_v5_walkthrough_session.sql** — Tabelle + Indizes + 4-Rollen-RLS
- Vollstaendiges DDL aus ARCHITECTURE.md V5-Sektion (siehe Block "walkthrough_session (neu)").
- Indizes: idx_walkthrough_session_tenant, idx_walkthrough_session_capture, idx_walkthrough_session_recorded_by, idx_walkthrough_session_status_pending (partial WHERE status='pending_review').
- ENABLE ROW LEVEL SECURITY.
- Drei Policies: `walkthrough_session_select`, `walkthrough_session_insert`, `walkthrough_session_update_review` (Wortlaut aus ARCHITECTURE.md, Worker-Status-Updates laufen via `service_role` und umgehen RLS bewusst).
- GRANT ALL ON public.walkthrough_session TO authenticated, service_role.

**084_v5_walkthrough_storage_bucket.sql** — Bucket + Storage-RLS
- `INSERT INTO storage.buckets (...) ON CONFLICT (id) DO NOTHING` mit `public=false`, `file_size_limit=524288000`, `allowed_mime_types=ARRAY['video/webm']`.
- 3 Storage-Policies: `walkthroughs_bucket_insert`, `walkthroughs_bucket_select`, `walkthroughs_bucket_delete` (Wortlaut aus ARCHITECTURE.md). SELECT-Policy referenziert `walkthrough_session` aus 083 — Sequencing-Pflicht.

### B — Server Actions

Pfad: `src/app/actions/walkthrough.ts` (neu)

```typescript
"use server";

export async function requestWalkthroughUpload(input: {
  captureSessionId: string;
  estimatedDurationSec: number;
}): Promise<{ walkthroughSessionId: string; uploadUrl: string; storagePath: string }>;

export async function confirmWalkthroughUploaded(input: {
  walkthroughSessionId: string;
  durationSec: number;
  fileSizeBytes: number;
}): Promise<{ ok: true }>;
```

Verhalten:
- **`requestWalkthroughUpload`**:
  - `requireAuth()` → user + tenantId. `requireRole(['employee', 'tenant_member', 'tenant_admin'])` (kein strategaize_admin als Aufnehmer).
  - Validierung: `estimatedDurationSec <= 1800` (DEC-076). `captureSessionId` muss zu `tenantId` gehoeren.
  - INSERT `walkthrough_session` mit `tenant_id`, `capture_session_id`, `recorded_by_user_id=user.id`, `status='recording'`.
  - `storagePath = <tenantId>/<walkthroughId>/recording.webm` (vorab reserviert).
  - `supabaseAdmin.storage.from('walkthroughs').createSignedUploadUrl(storagePath, { upsert: false })` — 15min TTL.
  - Returns `{ walkthroughSessionId, uploadUrl, storagePath }`.
- **`confirmWalkthroughUploaded`**:
  - `requireAuth()`. `walkthroughSession.recorded_by_user_id === user.id` (Self-Confirm-Only).
  - `status` muss `'recording' | 'uploading'` sein.
  - `durationSec <= 1800` (Fast-Fail; DB-CHECK fangs ohnehin ab).
  - UPDATE `walkthrough_session` SET `storage_path`, `duration_sec`, `file_size_bytes`, `status='uploaded'`.
  - INSERT `ai_jobs` (`job_type='walkthrough_transcribe'`, payload `{ walkthroughSessionId }`). Worker-Pickup laeuft in SLC-072.
  - `revalidatePath('/employee/walkthroughs/...')`.

### C — Capture-UI

Pfad: `src/app/(employee)/employee/capture/walkthrough/[id]/page.tsx` (neu, Server-Component lade-only) + `src/components/capture-modes/walkthrough/WalkthroughCapture.tsx` (neu, Client-Component, `"use client"`).

Verhalten der Client-Component:
- State-Maschine `idle | requesting | recording | stopping | uploading | uploaded | failed`.
- `idle` → Button "Walkthrough starten" → State `requesting` → 2 Permission-Prompts:
  - `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })` (DEC-078)
  - `navigator.mediaDevices.getUserMedia({ audio: true })`
- Beide Streams kombinieren (`new MediaStream([videoTrack, audioTrack])`), MediaRecorder anlegen mit `mimeType='video/webm;codecs=vp9,opus'`. Browser-Capability-Check: wenn `MediaRecorder.isTypeSupported(...)` false → User-friendly Error (Safari <16, Firefox kein vp9 → Fallback zu `video/webm;codecs=vp8,opus` mit Warnung).
- `mediaRecorder.start()` + setTimeout(autoStopAt30Min) als Hard-Stop. UI-Restzeit-Anzeige (Sekundengenau, Warnung bei 25min).
- `mediaRecorder.ondataavailable` → Blob sammeln. `mediaRecorder.onstop` → Blob finalisieren.
- Stopp-Button → `mediaRecorder.stop()` → State `stopping` → Server Action `requestWalkthroughUpload` → State `uploading`.
- Direct-Upload: `XMLHttpRequest` PUT an `uploadUrl`, `xhr.upload.onprogress` → Progress-Bar (0-100%).
- Nach Upload-Done: Server Action `confirmWalkthroughUploaded` → State `uploaded` → `router.push('/employee/walkthroughs/[id]')` (Status-Polling-Page).
- Pause/Resume optional (V5: nicht Pflicht, aber UI-State-Maschine sieht es vor).

### D — Status-Polling-Page

Pfad: `src/app/(employee)/employee/walkthroughs/[id]/page.tsx` (neu, Server-Component mit Client-Polling).

- SSR initial liefert `walkthrough_session` mit Status.
- Client polled `/api/walkthroughs/[id]/status` alle 5 Sek (eigener simpler Route-Handler in MT-7).
- Status-Anzeige: `uploaded → transcribing → pending_review → approved/rejected/failed`.
- Bei `pending_review` zeigt es "Aufnahme wartet auf Berater-Review" + Erklaer-Text.
- Bei `failed` zeigt es Error + Re-Upload-Hinweis.

### E — Status-API

Pfad: `src/app/api/walkthroughs/[id]/status/route.ts` (neu, GET).

```typescript
GET /api/walkthroughs/[id]/status
→ { status, transcript_completed_at?, reviewed_at?, reviewer_note? }
```

- requireAuth + RLS via `walkthrough_session_select`-Policy (User sieht nur eigene oder, falls Admin, Tenant/All).
- 404 wenn nicht sichtbar.

### F — Tests

- `src/app/actions/__tests__/walkthrough.test.ts` (neu): TDD-Pflicht (SaaS).
  - `requestWalkthroughUpload` happy path → Eintrag + signedUrl entstehen.
  - `requestWalkthroughUpload` validiert estimatedDurationSec > 1800 → throws.
  - `requestWalkthroughUpload` validiert captureSessionId aus anderem Tenant → throws.
  - `confirmWalkthroughUploaded` happy path → UPDATE + ai_jobs INSERT.
  - `confirmWalkthroughUploaded` validiert recorded_by !== user.id → throws.
  - `confirmWalkthroughUploaded` validiert status !== 'recording'|'uploading' → throws.
- `src/lib/db/__tests__/v5-walkthrough-rls.test.ts` (neu, **partial** RLS-Matrix — vollstaendige 16 Faelle in SLC-074):
  - 4 SELECT-Tests (1 pro Rolle). Erwartet: strategaize_admin alle, tenant_admin eigener Tenant, tenant_member/employee nur eigene Aufnahmen.
- `src/components/capture-modes/walkthrough/__tests__/WalkthroughCapture.test.tsx` (neu, leichtgewichtig, kein vollstaendiger E2E):
  - Mock `getDisplayMedia` + `getUserMedia` → State-Uebergang `idle → requesting → recording`.
  - `MediaRecorder.isTypeSupported`-Mock false → State `failed` mit User-Message.
  - autoStopAt30Min Timer-Verifikation (vi.useFakeTimers).

## Out of Scope

- Worker-Handler `walkthrough_transcribe` (SLC-072)
- Berater-Review-UI (SLC-073)
- Capture-Mode-Registry-UI-Eintrag (SLC-074, dort wird walkthrough_stub aus UI entfernt)
- Vollstaendige 4-Rollen-RLS-Matrix mit allen 16 Faellen (SLC-074)
- Cleanup-Cron (SLC-074)
- Pflicht-Checkbox vor Approve (SLC-073)
- KI-Pfade (V5.1)

## Acceptance Criteria

- AC-1: Migration 082 deployed auf Live-DB (Hetzner Onboarding 159.69.207.29) via base64-pipe + `psql -U postgres`. Verifizierbar: `\d capture_session` zeigt erweiterten capture_mode-CHECK; `\d knowledge_unit` zeigt erweiterten source-CHECK.
- AC-2: Migration 083 deployed. `\d walkthrough_session` zeigt vollstaendiges Schema, 4 Indizes, RLS aktiv, 3 Policies.
- AC-3: Migration 084 deployed. `SELECT * FROM storage.buckets WHERE id='walkthroughs'` zeigt Bucket mit `public=false`, `file_size_limit=524288000`, `allowed_mime_types=ARRAY['video/webm']`. 3 Storage-Policies aktiv.
- AC-4: Alle 3 Migrations sind idempotent — Re-Apply produziert keinen Drift.
- AC-5: Pre-Apply-Backup-Pflicht erfuellt: `pg_dump --schema-only public > /opt/onboarding-plattform-backups/pre-mig-031_<timestamp>.sql`.
- AC-6: `requestWalkthroughUpload` happy path produziert `walkthrough_session`-Eintrag (status='recording') + valide Supabase signed URL (TTL ~15min).
- AC-7: `confirmWalkthroughUploaded` happy path setzt `walkthrough_session.status='uploaded'` + queued `ai_jobs`-Eintrag fuer `walkthrough_transcribe`.
- AC-8: Server-Action verweigert Cross-Tenant-CaptureSession (Tenant-Isolation).
- AC-9: Server-Action verweigert estimatedDurationSec > 1800 mit klarem Error.
- AC-10: Capture-UI laeuft in Chrome+Edge: Permission-Prompts, Recording, Stop, Upload-Progress, Redirect zu Status-Page (manueller User-Smoke-Test, dokumentiert im Slice-Report).
- AC-11: 30min-Auto-Stopp greift im Browser (Test mit verkuerztem Timer auf 1min in einer Test-Variante verifiziert).
- AC-12: Status-Polling-Page zeigt korrekt `uploaded` direkt nach Upload, danach `transcribing` sobald SLC-072 Worker laeuft (SLC-072-Smoke kann es bestaetigen).
- AC-13: Vitest-Suite `src/app/actions/__tests__/walkthrough.test.ts` 6 Cases gruen.
- AC-14: Partial RLS-Test (4 SELECT-Faelle) gruen gegen Live-DB via SSH-Tunnel-Pattern (coolify-test-setup.md).
- AC-15: `npm run build` + `npm run lint` (0/0 Errors+Warnings) + `npm run test` gruen.

## Dependencies

- Vorbedingung: V4.4 released (REL-012, 2026-05-05) — V5-Foundation startet auf stabilem V4.4-Stand.
- Whisper-Container deployed seit V2 — Job-Queue-Pickup wird in SLC-072 wired.
- Voraussetzung fuer SLC-072 (Worker braucht walkthrough_session-Schema + ai_jobs-Eintrag).
- Voraussetzung fuer SLC-073 (Review-UI braucht walkthrough_session + Storage-Bucket).
- Voraussetzung fuer SLC-074 (Registry-Update + RLS-Matrix-Tests + Cleanup-Cron).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

- MIG-031 / `sql/migrations/082_v5_walkthrough_capture_mode.sql` — CHECK-Erweiterungen.
- MIG-031 / `sql/migrations/083_v5_walkthrough_session.sql` — Tabelle + RLS.
- MIG-031 / `sql/migrations/084_v5_walkthrough_storage_bucket.sql` — Bucket + Storage-RLS.

Sequencing strikt: 082 → 083 → 084 (Storage-RLS in 084 referenziert walkthrough_session aus 083).

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Pre-Apply-Backup** (`pg_dump --schema-only` vor 082-Apply, dokumentiert).
- **Pflicht-Gate: Migration-Live-Deploy** auf Hetzner via base64-pipe + `psql -U postgres` (rules/sql-migration-hetzner.md).
- **Pflicht-Gate: 4-Rollen-RLS-Partial-Test** (4 SELECT-Faelle, vollstaendige 16 Faelle in SLC-074).
- **Pflicht-Gate: Browser-Capability-Test** (`MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')` in Chrome/Edge → true).
- **Pflicht-Gate: Manueller User-Smoke-Test** des Capture-Pfads (User selbst, nicht-tech-Persona-Pattern aus SC-V4-5/V4.2-9). Dokumentiert im Slice-Report mit Screenshot oder Console-Output.
- `npm run lint` 0/0 + `npm run build` + `npm run test`.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-071 status `done`, planning/backlog.json BL-077 → `in_progress` bleibt (FEAT-034 Capture ist erst nach SLC-074 vollstaendig done), MIGRATIONS.md MIG-031 von "geplant" auf "live".

## Risks

- **R1 — Browser-Codec-Support fragil**: vp9+opus wird in Firefox nicht ueberall garantiert. Mitigation = Capability-Check + Fallback-Codec vp8+opus mit Warnung; Test in Chrome+Edge zwingend, Firefox best-effort.
- **R2 — Direct-Upload-Race (Browser bricht ab vor confirm)**: Mitigation = walkthrough_session bleibt in `'recording'`/`'uploading'`, Cleanup-Cron in SLC-074 raeumt nach 7 Tagen auf (`status='failed'`-Pfad). Worker pickt nichts bei `status='uploaded'` ohne `storage_path`.
- **R3 — 30min-Hard-Cap nicht gesetzt → grosser Storage-Verbrauch**: Mitigation = doppelter Check (Browser-Timer + DB-CHECK `duration_sec <= 1800`). Re-Apply der Migration verifiziert CHECK-Klausel.
- **R4 — Migration 084 referenziert walkthrough_session bevor 083 da ist**: Mitigation = strikte Apply-Reihenfolge dokumentiert (082 → 083 → 084), ein einzelner File-Apply pro Schritt mit Verifikation dazwischen.
- **R5 — Signed-URL-TTL ablaeuft waehrend Upload**: Mitigation = 15min TTL ist Default, ueblich genug fuer 30min-Walkthroughs (zeit-kritisch ist der Upload, nicht die Aufnahme — User hat die WebM bereits lokal). User-Recovery: Re-Klick "Hochladen" triggert neuen `requestWalkthroughUpload` mit neuer URL.

### Micro-Tasks

#### MT-1: Migration 082 — capture_mode + knowledge_unit.source CHECK-Erweiterung
- Goal: `sql/migrations/082_v5_walkthrough_capture_mode.sql` schreiben + Hetzner-Deploy + Pre-Apply-Backup.
- Files: `sql/migrations/082_v5_walkthrough_capture_mode.sql` (neu), `docs/MIGRATIONS.md` (MIG-031 Teilstatus 082 auf "live").
- Expected behavior: `capture_mode='walkthrough'` ist als gueltiger Wert eingetragen, `knowledge_unit.source='walkthrough_transcript'` ist gueltig. Idempotent (DROP CONSTRAINT IF EXISTS pattern).
- Verification: `\d+ capture_session | grep capture_mode_check`, `\d+ knowledge_unit | grep source_check`. Anschliessend `INSERT INTO capture_session (..., capture_mode='walkthrough')` als Smoke (Rollback nach Verifikation).
- Dependencies: Pre-Apply-Backup `pg_dump --schema-only public > /opt/onboarding-plattform-backups/pre-mig-031_<ts>.sql` durchgefuehrt.

#### MT-2: Migration 083 — walkthrough_session Tabelle + RLS
- Goal: `sql/migrations/083_v5_walkthrough_session.sql` schreiben + Hetzner-Deploy.
- Files: `sql/migrations/083_v5_walkthrough_session.sql` (neu), `docs/MIGRATIONS.md` (MIG-031 Teilstatus 083 auf "live").
- Expected behavior: Tabelle existiert, 4 Indizes, RLS aktiv, 3 Policies. GRANT TO authenticated/service_role.
- Verification: `\d walkthrough_session` zeigt vollstaendiges Schema. `SELECT polname FROM pg_policy WHERE polrelid='walkthrough_session'::regclass` listet 3 Policies. `SELECT relrowsecurity FROM pg_class WHERE relname='walkthrough_session'` = true.
- Dependencies: MT-1 (082 muss live sein, sonst INSERT-Smokes mit 'walkthrough' wuerden fehlschlagen).

#### MT-3: Migration 084 — Storage-Bucket + Storage-RLS
- Goal: `sql/migrations/084_v5_walkthrough_storage_bucket.sql` schreiben + Hetzner-Deploy.
- Files: `sql/migrations/084_v5_walkthrough_storage_bucket.sql` (neu), `docs/MIGRATIONS.md` (MIG-031 vollstaendig "live").
- Expected behavior: Bucket `walkthroughs` existiert mit korrekten Limits + 3 Storage-Policies. Re-Apply produziert keinen Drift (`ON CONFLICT DO NOTHING` + `CREATE POLICY IF NOT EXISTS` oder DROP-vor-CREATE-Pattern).
- Verification: `SELECT * FROM storage.buckets WHERE id='walkthroughs'` zeigt korrekten Bucket. `SELECT polname FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname LIKE 'walkthroughs%'` listet 3 Policies.
- Dependencies: MT-2 (Storage-SELECT-Policy referenziert walkthrough_session).

#### MT-4: Server Action `requestWalkthroughUpload`
- Goal: Server-Action in `src/app/actions/walkthrough.ts` mit requireAuth, Validierung, INSERT walkthrough_session, signed URL-Erzeugung.
- Files: `src/app/actions/walkthrough.ts` (neu), `src/app/actions/__tests__/walkthrough.test.ts` (neu, partial).
- Expected behavior: Validiert estimatedDurationSec, Cross-Tenant-Check, INSERT mit korrektem storage_path, Returns walkthroughSessionId+uploadUrl+storagePath.
- Verification: 3 Vitest-Test-Cases (happy path + duration-Validierung + Cross-Tenant-Reject). Live-Smoke: Action via Test-Page rufen, `walkthrough_session` Eintrag entsteht mit status='recording'.
- Dependencies: MT-2 (Schema live), Whisper-Adapter aus V2 unbeeinflusst.
- TDD-Note: TDD-Pflicht (SaaS).

#### MT-5: Server Action `confirmWalkthroughUploaded` + ai_jobs INSERT
- Goal: Server-Action in derselben Datei mit Self-Confirm-Check, UPDATE walkthrough_session, INSERT ai_jobs.
- Files: `src/app/actions/walkthrough.ts` (extend), `src/app/actions/__tests__/walkthrough.test.ts` (extend, +3 Cases).
- Expected behavior: UPDATE setzt storage_path/duration/file_size + status='uploaded'. ai_jobs.status='pending'. Cross-User-Confirm wird abgelehnt.
- Verification: 3 Vitest-Test-Cases (happy path + Cross-User-Reject + Status-Validierung). Live-Smoke: nach MT-4 + manuellem Browser-Upload → `confirmWalkthroughUploaded` ruft → `SELECT * FROM ai_jobs WHERE job_type='walkthrough_transcribe'` zeigt neuen pending-Eintrag.
- Dependencies: MT-4 (request-Action erstellt walkthrough_session), MT-2 (Schema).
- TDD-Note: TDD-Pflicht (SaaS).

#### MT-6: Capture-UI Client-Component WalkthroughCapture
- Goal: `WalkthroughCapture.tsx` ("use client") mit getDisplayMedia + getUserMedia + MediaRecorder + Upload-Progress.
- Files: `src/components/capture-modes/walkthrough/WalkthroughCapture.tsx` (neu), `src/components/capture-modes/walkthrough/__tests__/WalkthroughCapture.test.tsx` (neu, leichtgewichtig).
- Expected behavior: 7-State-Maschine, Permission-Prompts, MediaRecorder mit vp9+opus (Fallback vp8+opus), 30min Auto-Stopp, XHR-Upload mit Progress-Bar, Redirect zu Status-Page nach confirm.
- Verification: 3 Vitest-Test-Cases (idle→requesting State, isTypeSupported-false-Path, autoStop-Timer mit fakeTimers). Manueller Smoke in Chrome+Edge.
- Dependencies: MT-4 + MT-5 (Server Actions verfuegbar).

#### MT-7: Status-Polling-Page + Status-API
- Goal: Server-Component-Page `/employee/walkthroughs/[id]` + Polling-Component + Route-Handler.
- Files: `src/app/(employee)/employee/walkthroughs/[id]/page.tsx` (neu), `src/components/capture-modes/walkthrough/WalkthroughStatusPolling.tsx` (neu, "use client"), `src/app/api/walkthroughs/[id]/status/route.ts` (neu).
- Expected behavior: SSR initial liefert Status. Polling alle 5s. Bei status='pending_review' Stop-Polling + Berater-Review-Wartetext. Bei 'failed' Error + Re-Try-Hint. Bei 'approved' / 'rejected' Final-State.
- Verification: Manueller Smoke (nach SLC-072-Worker-Start sieht User Statusverlauf `uploaded → transcribing → pending_review`).
- Dependencies: MT-2 (Schema), MT-5 (status='uploaded' Trigger).

#### MT-8: Capture-Page Server-Component (Loader)
- Goal: `/employee/capture/walkthrough/[id]/page.tsx` als Server-Component, lade capture_session, Authorization-Check, render `<WalkthroughCapture />`.
- Files: `src/app/(employee)/employee/capture/walkthrough/[id]/page.tsx` (neu).
- Expected behavior: 404 wenn capture_session nicht zum tenant gehoert. requireRole employee/tenant_member/tenant_admin (kein strategaize_admin). Layout-Konsistenz mit anderen `/employee/capture`-Pfaden.
- Verification: `curl https://onboarding.../employee/capture/walkthrough/<valid-id>` HTTP 200; mit foreign-Tenant-id HTTP 404.
- Dependencies: MT-6 (Component-Existenz).

#### MT-9: Build + Lint + Test gruen
- Goal: `npm run lint`, `npm run build`, `npm run test` alle gruen ohne Errors/Warnings.
- Files: keine neuen — nur Verifikation.
- Expected behavior: 0 Lint-Errors, 0 Lint-Warnings (V4.4 SLC-061-Standard), Build-Bundle ohne neue Warnings, Vitest 100% PASS inkl. 6 neuen walkthrough-Tests + 4 neuen RLS-Partial-Tests + 3 neuen Capture-Component-Tests.
- Verification: Output-Snapshots im Slice-Report.
- Dependencies: MT-1..MT-8 alle done.
