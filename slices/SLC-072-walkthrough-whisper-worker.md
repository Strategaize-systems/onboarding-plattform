# SLC-072 — Walkthrough Whisper-Worker (Job-Handler `walkthrough_transcribe`)

## Status-Anmerkung (V5 Option 2)

Der Slice bleibt im Scope unveraendert. **EINE Aenderung gegenueber Original-Spec:** Status-Maschine endet **nicht mehr** bei `pending_review`, sondern advanced auf `redacting` und enqueued den Stufe-1-Pipeline-Job `walkthrough_redact_pii`. Konkret: am Ende des `walkthrough_transcribe`-Job ruft der Worker `advanceWalkthroughPipeline(walkthroughSessionId)` (aus SLC-076 MT-5 Pipeline-Trigger), das Status auf `redacting` setzt + neuen ai_jobs-Eintrag fuer Stufe 1 erzeugt. Diese Anpassung ist Teil von SLC-076 MT-5 — SLC-072 selbst kann ohne diesen Trigger noch `pending_review` setzen, aber der Pipeline-Trigger-Patch ist Voraussetzung fuer V5 Option 2 Release.

## Goal

Worker-Pfad fuer V5 Walkthrough-Mode. Neuer Job-Handler `walkthrough_transcribe` im bestehenden Worker-Container: pickt `ai_jobs`-Eintraege, laedt WebM aus Storage, extrahiert Audio-Spur via ffmpeg, ruft Self-hosted Whisper (DEC-018-Adapter wiederverwendet), persistiert Transcript als `knowledge_unit` mit `source='walkthrough_transcript'`, fuehrt Status-Maschine `uploaded → transcribing → pending_review` **(in V5 Option 2: → `redacting` via SLC-076 Pipeline-Trigger)** (oder `failed` bei Fehler).

## Feature

FEAT-035 (Walkthrough Whisper-Transkription). Setzt direkt auf SLC-071 (Schema + ai_jobs-Eintrag) auf. In V5 Option 2 ist SLC-072-Output Pipeline-Input fuer SLC-076 Stufe 1.

## In Scope

### A — Worker-Job-Handler

Pfad: `worker/src/handlers/walkthroughTranscribe.ts` (neu)

```typescript
export async function handleWalkthroughTranscribe(job: AiJob): Promise<void>;
```

Verhalten:
1. Parse `job.payload` → `{ walkthroughSessionId }`. Validiert UUID.
2. Lade `walkthrough_session` via `service_role` (umgeht RLS bewusst — Worker arbeitet system-side).
3. Validiert `status === 'uploaded'`. Andernfalls Job-Skip mit Warning-Log.
4. UPDATE `walkthrough_session SET status='transcribing', transcript_started_at=now()`.
5. Storage Download: `supabaseAdmin.storage.from('walkthroughs').download(storage_path)` → Buffer → `/tmp/<id>.webm` schreiben.
6. ffmpeg Audio-Extract: `ffmpeg -i /tmp/<id>.webm -vn -acodec libopus -b:a 64k /tmp/<id>.opus`.
7. Whisper-Adapter (`worker/src/adapters/whisper.ts` aus V2 reuse): `whisper.transcribe(filePath, { model: 'whisper-medium', language: 'de' })`.
8. Insert `knowledge_unit`:
   ```typescript
   {
     tenant_id: walkthroughSession.tenant_id,
     capture_session_id: walkthroughSession.capture_session_id,
     source: 'walkthrough_transcript',
     unit_type: 'observation',
     confidence: 'medium',
     body: transcriptText,
     evidence_refs: { walkthrough_session_id: walkthroughSession.id },
     created_by_user_id: walkthroughSession.recorded_by_user_id,
   }
   ```
9. UPDATE `walkthrough_session SET transcript_completed_at=now(), transcript_model='whisper-medium', transcript_knowledge_unit_id=<ku.id>, status='pending_review'`.
10. `/tmp/<id>.webm` + `/tmp/<id>.opus` aufraeumen (try/finally).
11. Audit-Log via existing `error_log`-Pattern: `category='walkthrough_transcription'`, level='info'.

### B — Error-Handling / Failed-Path

Bei Exception in Schritt 5..9:
- UPDATE `walkthrough_session SET status='failed'`.
- error_log INSERT mit category='walkthrough_transcription', level='error', stack-trace.
- Job-Engine markiert ai_jobs-Eintrag als `failed` (existing pattern).
- /tmp Cleanup im finally.
- Kein Retry in V5 (Manual-Re-Upload-Pfad: User loescht Aufnahme + nimmt neu auf). Retry-Mechanik fuer V5.2.

### C — Job-Engine-Registration

Pfad: `worker/src/index.ts` (modify) — den neuen Handler in der Job-Type-Routing-Map registrieren.

```typescript
const handlers = {
  // existing: 'voice_transcribe', 'condense_block', 'bridge_run', 'block_review_pre_filter', 'handbuch_snapshot', etc.
  'walkthrough_transcribe': handleWalkthroughTranscribe,
};
```

### D — Adapter-Wiederverwendung

`worker/src/adapters/whisper.ts` aus V2 (FEAT-015 / DEC-018) **bleibt unveraendert**. Ggf. nur Konfigurations-Param `language: 'de'` durchreichen, falls heutige V2-Defaults bereits DE sind. Worker-Container, Whisper-Container und Bedrock-Adapter bleiben unangefasst.

### E — ffmpeg-Verfuegbarkeit

ffmpeg ist im Worker-Container bereits installiert (V2 Voice-Pipeline + V3 Recording-Pipeline). MT-Verifikation: `docker exec <worker-container> ffmpeg -version` zeigt Version (Erwartet ≥ 4.x). Wenn nicht: Dockerfile-Update als MT.

### F — Tests

- `worker/src/handlers/__tests__/walkthroughTranscribe.test.ts` (neu): TDD-Pflicht (SaaS).
  - Happy path: Mock supabaseAdmin + Mock Whisper-Adapter + Mock ffmpeg → State-Maschine + KU-INSERT verifiziert.
  - Status-Skip: walkthrough_session.status='approved' → Handler wirft nicht, sondern logged Warning + return early.
  - ffmpeg-Fehler: Mock ffmpeg-exec rejects → walkthrough_session.status='failed' + error_log entsteht.
  - Whisper-Fehler: Mock whisper-adapter rejects → status='failed' + error_log.
  - /tmp-Cleanup im finally: Test mit forced-throw nach ffmpeg verifiziert /tmp/<id>.opus geloescht.
- Manueller Live-Smoke (nach SLC-071 + SLC-072 Deploy):
  - User nimmt 1min Walkthrough auf → SLC-071 confirmUploaded → Worker pickt Job → Status-Page zeigt Verlauf `uploaded → transcribing → pending_review` innerhalb von <2min.
  - `SELECT body FROM knowledge_unit WHERE source='walkthrough_transcript'` zeigt deutschen Transkript-Text.

## Out of Scope

- Berater-Review-UI (SLC-073)
- Capture-Mode-Registry-Update (SLC-074)
- Vollstaendige RLS-Matrix (SLC-074)
- Cleanup-Cron (SLC-074)
- KI-Schritt-Extraktion / PII-Redaction (V5.1)
- Retry-Mechanik fuer failed-Transkriptionen (V5.2+)
- Mehrsprachige Transkription (V5: DE only)

## Acceptance Criteria

- AC-1: `worker/src/handlers/walkthroughTranscribe.ts` existiert und ist in `worker/src/index.ts` Job-Type-Routing registriert.
- AC-2: Handler validiert `walkthrough_session.status='uploaded'` und ueberspringt Jobs mit anderen Stati ohne Exception.
- AC-3: Status-Uebergaenge: `'uploaded' → 'transcribing'` beim Start, `'transcribing' → 'pending_review'` bei Erfolg, `'transcribing' → 'failed'` bei Exception.
- AC-4: Bei Erfolg entsteht `knowledge_unit` mit `source='walkthrough_transcript'`, `unit_type='observation'`, `confidence='medium'`, `evidence_refs.walkthrough_session_id=<id>`. RLS-konform: Tenant-Isolation greift.
- AC-5: Bei Erfolg: `walkthrough_session.transcript_knowledge_unit_id` referenziert die neue KU; `transcript_completed_at`, `transcript_model='whisper-medium'` gesetzt.
- AC-6: Bei Exception in Download/ffmpeg/Whisper: `walkthrough_session.status='failed'` + `error_log` Eintrag mit Stack + ai_jobs-Eintrag wird `failed`.
- AC-7: `/tmp/<id>.webm` + `/tmp/<id>.opus` werden in jedem Fall aufgeraeumt (try/finally).
- AC-8: Whisper-Adapter aus V2 (DEC-018) wird unveraendert wiederverwendet — Adapter-Datei nicht modifiziert.
- AC-9: ffmpeg-Verfuegbarkeit im Worker-Container verifiziert (`ffmpeg -version` ≥ 4.x).
- AC-10: 5 Vitest-Test-Cases gruen (`worker/src/handlers/__tests__/walkthroughTranscribe.test.ts`).
- AC-11: Live-Smoke (User-Persona): 1min-Walkthrough → Status `uploaded → transcribing → pending_review` innerhalb <2min sichtbar in Status-Page; `knowledge_unit` mit deutschem Text persistiert.
- AC-12: `npm run lint` 0/0 + `npm run build` (Worker-Bundle) + `npm run test` gruen.
- AC-13: Worker-Container im Coolify nach Deploy `(healthy)` (existing Healthcheck).

## Dependencies

- Vorbedingung: SLC-071 done (Schema + Storage-Bucket + Server-Action confirmUploaded queued ai_jobs-Eintrag).
- V2 Whisper-Adapter (DEC-018) deployed.
- Self-hosted Whisper-Container deployed seit V2.
- ffmpeg im Worker-Container verfuegbar (deployed seit V2/V3).
- Voraussetzung fuer SLC-073 (Berater-Review braucht `pending_review`-Eintraege + persistiertes Transkript).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — SLC-072 nutzt das in SLC-071 deployed Schema.

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Live-Smoke-Test** End-to-End (User nimmt auf, Worker transkribiert, Status flippt). Dokumentiert im Slice-Report mit Timing-Messung (Wall-Time von confirm bis pending_review).
- **Pflicht-Gate: Worker-Container-Logs** sauber (kein Crash-Loop, kein Memory-Leak ueber 5 aufeinanderfolgende Jobs).
- **Pflicht-Gate: Backwards-Compat-Test** — alte V2/V3/V4-Job-Types laufen weiterhin (`voice_transcribe`, `condense_block`, `bridge_run`, `block_review_pre_filter`, `handbuch_snapshot` weiterhin pickbar).
- **Pflicht-Gate: ffmpeg-Sanity** auf Worker-Container.
- `npm run lint` 0/0 + `npm run build` + `npm run test`.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-072 status `done`, planning/backlog.json BL-078 → `in_progress` bleibt (FEAT-035 Whisper ist erst nach SLC-074 vollstaendig done).

## Risks

- **R1 — ffmpeg-Speicher-Spikes bei 30min-Aufnahmen**: Mitigation = Streaming-Decode (`ffmpeg -i pipe:0 ...`) statt Buffer-Loading; alternativ 2GB Container-Memory-Limit im Coolify pruefen. Test mit 28min-Aufnahme.
- **R2 — Whisper-Backlog bei vielen parallelen Walkthroughs**: Mitigation = ai_jobs-Worker hat existing FIFO-Queue, keine echte Parallel-Last erwartet (V5-Pilot hat <5 Walkthroughs/Tag). V5.2 ggf. Job-Priority + Worker-Skalierung.
- **R3 — Whisper-Container-Crash unterbricht laufende Transkription**: Mitigation = walkthrough_session.status='transcribing' bleibt bei Crash haengen. Recovery in V5.2 (Cleanup-Cron in SLC-074 detected stale `transcribing > 1h` und setzt auf `failed`).
- **R4 — knowledge_unit-Eintrag ohne RLS-Sicht durch Berater-Mitglieder**: Mitigation = `source='walkthrough_transcript'` ist neu; bestehende KU-RLS-Policy muss sicherstellen, dass tenant_member ohne Bezug zur Session NICHT sehen darf. Verifikation: 1 RLS-Test in SLC-074 deckt es ab. SLC-072-Live-Smoke prueft `recorded_by`-Sicht.
- **R5 — Service-Role-Pfad umgeht versehentlich Tenant-Validation**: Mitigation = Handler liest `tenant_id` aus walkthrough_session und schreibt KU mit demselben tenant_id (kein Tenant-Switch moeglich). Test verifiziert.

### Micro-Tasks

#### MT-1: ffmpeg-Sanity + Adapter-Reuse-Check
- Goal: ffmpeg im Worker-Container verfuegbar (`ffmpeg -version` ≥ 4.x). Whisper-Adapter aus V2 ist importierbar und API-stabil.
- Files: keine neuen — nur Verifikation. Doku im Slice-Report.
- Expected behavior: `docker exec <worker-container> ffmpeg -version` zeigt Version. `import { whisper } from '../adapters/whisper'` in TypeScript ohne Type-Errors.
- Verification: Output-Snapshot im Slice-Report.
- Dependencies: keine.

#### MT-2: Handler `handleWalkthroughTranscribe` (Happy Path + Status-Flip)
- Goal: Vollstaendiger Handler in `worker/src/handlers/walkthroughTranscribe.ts` mit allen 11 Schritten (Parse → Load → Status='transcribing' → Download → ffmpeg → Whisper → KU INSERT → Status='pending_review' → Cleanup).
- Files: `worker/src/handlers/walkthroughTranscribe.ts` (neu), `worker/src/handlers/__tests__/walkthroughTranscribe.test.ts` (neu, +3 Cases).
- Expected behavior: Happy path setzt alle Felder korrekt, KU mit korrekten Werten + RLS-konform, /tmp-Cleanup im finally.
- Verification: 3 Vitest-Cases (happy path + KU-Felder + Status-Maschine).
- Dependencies: MT-1 (Adapter-Verfuegbarkeit).
- TDD-Note: TDD-Pflicht — Test vor Implementation.

#### MT-3: Handler-Failed-Path + Error-Logging
- Goal: Try/Catch um Schritt 5..9. Bei Exception → Status='failed' + error_log + /tmp-Cleanup.
- Files: `worker/src/handlers/walkthroughTranscribe.ts` (extend), `worker/src/handlers/__tests__/walkthroughTranscribe.test.ts` (extend, +3 Cases).
- Expected behavior: ffmpeg-Mock-throws → status='failed', error_log entsteht. Whisper-Mock-throws → status='failed'. forced-throw nach ffmpeg → /tmp-Cleanup laeuft trotzdem.
- Verification: 3 Vitest-Cases gruen, alle Failure-Pfade decken Status + Cleanup.
- Dependencies: MT-2.

#### MT-4: Job-Engine-Registration in `worker/src/index.ts`
- Goal: Handler-Map um `'walkthrough_transcribe': handleWalkthroughTranscribe` erweitern. Existing handlers unangetastet.
- Files: `worker/src/index.ts` (modify).
- Expected behavior: Worker pickt ai_jobs-Eintraege mit job_type='walkthrough_transcribe' und ruft Handler. Backwards-Compat: alle bestehenden job_types weiter pickbar.
- Verification: Vitest oder existing Worker-Boot-Test prueft Handler-Map. Live-Smoke nach Deploy: `docker logs <worker>` zeigt "registered handler walkthrough_transcribe".
- Dependencies: MT-2.

#### MT-5: Live-Smoke + Backwards-Compat-Test
- Goal: End-to-End-Smoke (User-Persona) + Verifikation alter Job-Types weiter laufen.
- Files: keine neuen — nur Verifikation.
- Expected behavior: Live-Smoke laeuft End-to-End in <2min Wall-Time. Mindestens 1 alter Job-Type (z.B. `condense_block` oder `voice_transcribe`) wird in derselben Session gepickt + erfolgreich verarbeitet.
- Verification: Slice-Report dokumentiert Timing + Logs der parallel laufenden Jobs.
- Dependencies: MT-4 + Worker-Deploy auf Coolify (User-Pflicht: manueller Coolify-Deploy nach MT-4).
