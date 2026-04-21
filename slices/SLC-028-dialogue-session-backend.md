# SLC-028 — Dialogue Session Backend

## Goal
dialogue_session-Tabelle, capture_mode-Erweiterung, JWT-Generierung, Recording-Webhook, Storage-Bucket. Backend-Basis fuer das Meeting-UI (SLC-029) und die Pipeline (SLC-030/031).

## Feature
FEAT-019

## In Scope
- Migration 059: dialogue_session-Tabelle + RLS + Indexes
- Migration 060: capture_session/knowledge_unit CHECK-Constraints erweitern (dialogue)
- Migration 061: Supabase Storage Bucket 'recordings'
- Migration 062: RPCs fuer dialogue_session CRUD + transcript/summary Persistierung
- JWT-Generierung fuer Jitsi (src/lib/jitsi/jwt.ts)
- Server Actions: createDialogueSession, updateDialogueStatus, fetchDialogueSession
- API-Route: POST /api/dialogue/recording-ready (Webhook von Jibri-Finalize-Script)
- Recording-Upload in Supabase Storage
- Tests

## Out of Scope
- Jitsi IFrame UI (SLC-029)
- Whisper-Transkription (SLC-030)
- KI-Extraktion (SLC-031)

## Acceptance Criteria
- AC-1: dialogue_session-Tabelle existiert mit allen Status-Werten
- AC-2: capture_session akzeptiert capture_mode='dialogue'
- AC-3: JWT-Generator erzeugt gueltige Jitsi-JWTs
- AC-4: Recording-Webhook empfaengt Notification und uploaded MP4 in Storage
- AC-5: Storage-Bucket 'recordings' existiert mit Tenant-Isolation
- AC-6: RLS-Test: tenant_admin/member sehen nur eigene Sessions
- AC-7: knowledge_unit akzeptiert source='dialogue'

## Dependencies
- SLC-025 (Jitsi muss laufen fuer Webhook-Test)
- SLC-026 (meeting_guide-Tabelle fuer FK)

## Worktree
Empfohlen (SaaS, 4 Migrationen)

### Micro-Tasks

#### MT-1: Migration 059 — dialogue_session Tabelle
- Goal: dialogue_session mit allen Spalten, Status-CHECK, RLS, Indexes, GRANTs
- Files: `sql/migrations/059_dialogue_session.sql`
- Expected behavior: Tabelle mit id, tenant_id, capture_session_id, meeting_guide_id FK, jitsi_room_name UNIQUE, status CHECK (8 Werte), participant_a/b_user_id, recording_storage_path, transcript, summary JSONB, gaps JSONB, consent_a/b, timestamps. RLS: tenant Read eigener Tenant, strategaize_admin Full.
- Verification: `\d dialogue_session` auf Hetzner-DB
- Dependencies: none

#### MT-2: Migration 060 + 061 — CHECK-Constraints + Storage-Bucket
- Goal: capture_mode='dialogue' in capture_session erlauben. source='dialogue' in knowledge_unit erlauben. Storage-Bucket 'recordings' erstellen.
- Files: `sql/migrations/060_capture_mode_dialogue.sql`, `sql/migrations/061_recordings_bucket.sql`
- Expected behavior: INSERT capture_session mit capture_mode='dialogue' funktioniert. INSERT knowledge_unit mit source='dialogue' funktioniert. Storage-Bucket existiert.
- Verification: Test-INSERTs auf Hetzner-DB + `SELECT * FROM storage.buckets WHERE id='recordings'`
- Dependencies: none

#### MT-3: Migration 062 — Dialogue RPCs
- Goal: RPCs fuer dialogue_session-Lifecycle
- Files: `sql/migrations/062_rpc_dialogue.sql`
- Expected behavior: rpc_create_dialogue_session, rpc_update_dialogue_status, rpc_save_transcript, rpc_save_extraction_results. Alle SECURITY DEFINER mit Rollencheck.
- Verification: RPC-Aufruf via psql
- Dependencies: MT-1

#### MT-4: JWT-Generator
- Goal: Jitsi-JWT-Generierung fuer Meeting-Teilnehmer
- Files: `src/lib/jitsi/jwt.ts`
- Expected behavior: generateJitsiJwt({ roomName, userId, displayName, email, isModerator }) → gueltige JWT-String. HS256 via node:crypto.
- Verification: Generierter JWT oeffnet Meeting auf Jitsi-Instanz (manueller Browser-Test)
- Dependencies: SLC-025 (Jitsi laeuft)

#### MT-5: Server Actions + Types
- Goal: Dialogue-Session CRUD Server Actions + TypeScript Types
- Files: `src/types/dialogue-session.ts`, `src/app/actions/dialogue-session-actions.ts`
- Expected behavior: createDialogueSession (mit Teilnehmer-Zuweisung), updateDialogueStatus, fetchDialogueSession, fetchDialogueForSession. Auth-Check in jeder Action.
- Verification: Manueller Server Action Test
- Dependencies: MT-1, MT-3

#### MT-6: Recording-Webhook + Storage-Upload
- Goal: POST /api/dialogue/recording-ready empfaengt Jibri-Webhook, uploaded MP4 in Storage
- Files: `src/app/api/dialogue/recording-ready/route.ts`
- Expected behavior: Webhook authentifiziert via RECORDING_WEBHOOK_SECRET. Laedt MP4 aus Jibri-Volume. Uploaded in Storage (recordings/{tenant_id}/{dialogue_id}/recording.mp4). Enqueued dialogue_transcription Job.
- Verification: curl-Test mit Mock-Payload
- Dependencies: MT-1, MT-2, MT-5

#### MT-7: Tests
- Goal: RLS-Isolation + JWT-Generierung Tests
- Files: `src/lib/db/__tests__/dialogue-session-rls.test.ts`, `src/lib/jitsi/__tests__/jwt.test.ts`
- Expected behavior: RLS-Isolation verifiziert. JWT-Payload korrekt (room, sub, exp, context).
- Verification: `npm run test` — alle Tests gruen
- Dependencies: MT-1, MT-4
