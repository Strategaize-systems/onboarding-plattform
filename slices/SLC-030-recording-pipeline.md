# SLC-030 — Recording Pipeline

## Goal
Jibri-Finalize-Script, MP4-Upload in Supabase Storage, dialogue_transcription Worker-Job (MP4 → ffmpeg → Whisper → Transkript). Verbindung zwischen Meeting-Ende und KI-Verarbeitung.

## Feature
FEAT-020

## In Scope
- Jibri Finalize-Script (jibri-finalize.sh)
- MP4 → Supabase Storage Upload (via Recording-Webhook aus SLC-028)
- Neuer Worker-Job-Type: dialogue_transcription
- ffmpeg Audio-Extraktion aus MP4
- Whisper-Transkription (bestehender Container, laengere Dateien)
- Transkript-Persistierung auf dialogue_session.transcript
- Status-Tracking (completed → transcribing → processing)
- Auto-Enqueue dialogue_extraction nach Transkription

## Out of Scope
- KI-Extraktion (SLC-031)
- Meeting-Summary UI (SLC-032)

## Acceptance Criteria
- AC-1: Finalize-Script verschiebt MP4 und triggert Webhook
- AC-2: MP4 landet in Supabase Storage (recordings/{tenant_id}/{dialogue_id}/...)
- AC-3: Worker transkribiert MP4 via Whisper erfolgreich
- AC-4: Transkript ist auf dialogue_session.transcript gespeichert
- AC-5: Status wechselt korrekt (completed → transcribing → processing)
- AC-6: dialogue_extraction Job wird automatisch enqueued

## Dependencies
- SLC-025 (Jibri laeuft, Recording produziert MP4)
- SLC-028 (dialogue_session-Tabelle, Webhook-Route, Storage-Bucket)

## Worktree
Empfohlen (SaaS, Worker-Code)

### Micro-Tasks

#### MT-1: Jibri Finalize-Script
- Goal: Script das nach Jibri-Recording den Webhook aufruft
- Files: `scripts/jibri-finalize.sh`
- Expected behavior: Findet MP4 im Recording-Verzeichnis. Extrahiert Room-Name. POST an /api/dialogue/recording-ready mit room_name + file_path. Exit 0 bei Erfolg.
- Verification: Manuelles Recording → Script laeuft → Webhook wird aufgerufen
- Dependencies: none

#### MT-2: Recording-Webhook Upload-Logik
- Goal: Webhook-Route (SLC-028 MT-6) um Storage-Upload erweitern
- Files: `src/app/api/dialogue/recording-ready/route.ts` (erweitern)
- Expected behavior: Empfaengt Webhook → liest MP4 aus Jibri-Volume (via docker exec oder shared mount) → uploaded in Supabase Storage → setzt recording_storage_path → enqueued dialogue_transcription Job.
- Verification: Nach Recording: MP4 in Storage sichtbar, ai_job enqueued
- Dependencies: MT-1

#### MT-3: Worker dialogue_transcription Handler
- Goal: Neuer Job-Handler fuer Transkription
- Files: `src/workers/dialogue/handle-transcription-job.ts`
- Expected behavior: Laedt MP4 aus Supabase Storage. Extrahiert Audio (ffmpeg). Sendet an Whisper. Speichert Transkript. Enqueued dialogue_extraction. Status-Updates.
- Verification: Job claimen → MP4 → Transkript gespeichert → naechster Job enqueued
- Dependencies: MT-2

#### MT-4: ffmpeg Audio-Extraktion
- Goal: MP4 → WAV-Audio-Datei fuer Whisper
- Files: `src/workers/dialogue/audio-extract.ts`
- Expected behavior: ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav. Temporaere Datei. Cleanup nach Whisper-Call.
- Verification: 1-Minuten-Test-MP4 → WAV-Output korrekt
- Dependencies: none (Utility)

#### MT-5: Whisper-Integration fuer lange Audio
- Goal: Bestehenden Whisper-Adapter fuer laengere Audio-Dateien nutzen
- Files: `src/workers/dialogue/handle-transcription-job.ts` (Whisper-Aufruf)
- Expected behavior: POST audio file an Whisper-Container (30-60min Audio). Response mit Volltext-Transkript. Timeout angepasst (Whisper braucht 3-8min fuer 60min Audio).
- Verification: 5-Minuten-Test-Audio → Transkript zurueck
- Dependencies: MT-3, MT-4

#### MT-6: Claim-Loop-Registration + Tests
- Goal: dialogue_transcription im Worker-Claim-Loop registrieren
- Files: `src/workers/run.ts` (erweitern), `src/workers/dialogue/__tests__/transcription.test.ts`
- Expected behavior: Worker pollt auch dialogue_transcription Jobs. Test verifiziert Job-Flow.
- Verification: `npm run test` gruen. Worker-Logs zeigen dialogue_transcription im Claim-Loop.
- Dependencies: MT-3
