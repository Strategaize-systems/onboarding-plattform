# FEAT-035 — Walkthrough Whisper-Transkription

**Version:** V5
**Status:** planned
**Created:** 2026-05-05

## Zweck
Audio-Spur einer Walkthrough-Session wird durch den bestehenden Self-hosted Whisper-Container transkribiert. Transkript landet als `knowledge_unit` mit `source='walkthrough_transcript'` in der DB.

## Hintergrund
Whisper-Adapter-Pattern existiert seit V2 (FEAT-015 Voice-Input + DEC-018 Adapter-Konvention). V5 reusiert das Pattern, bekommt aber eine eigene Job-Type-Variante fuer Walkthrough-Audio (laengere Streams als Voice-Input).

## In Scope
- Audio-Spur Extraktion aus WebM-Recording (ffmpeg-Worker oder Browser-side Pre-Upload-Split — /architecture klaert)
- Whisper-Transcription-Job-Type `walkthrough_transcribe`
- Worker-Handler fuer `walkthrough_transcribe` (analog Voice-Adapter)
- Transcript-Persistierung in `knowledge_unit` mit klarer Source-Markierung
- Status-Tracking (`pending` → `transcribing` → `completed` / `failed`) auf `walkthrough_session`
- Status-Polling-API fuer UI

## Out of Scope
- KI-Schritt-Extraktion aus Transkript (V5.1, FEAT-037)
- PII-Auto-Redaction (V5.1, FEAT-037)
- Mehrsprachige Transkription (DE only fuer V5, EN als V5.2+)
- Live-Streaming-Transcription waehrend Aufnahme

## Akzeptanzkriterien (Skizze)
- Walkthrough-Session in DB getriggert → Whisper-Job in `ai_jobs` queued
- Worker-Pipeline transkribiert Audio < 1.5x Realtime
- Transkript-Knowledge-Unit ist Tenant-isoliert (RLS) und an die Walkthrough-Session referenziert
- UI zeigt Transcript-Status in Pending-Walkthrough-Liste

## Abhaengigkeiten
- FEAT-034 (Walkthrough Capture-Session)
- FEAT-015 Voice-Input / DEC-018 Whisper-Adapter (deployed)
- Self-hosted Whisper-Container (deployed seit V2)

## Verweise
- PRD V5-Sektion (SC-V5-2)
- /requirements V5 RPT-XXX (2026-05-05)
- DEC-018 Whisper-Adapter-Pattern
