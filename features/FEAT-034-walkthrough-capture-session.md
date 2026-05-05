# FEAT-034 — Walkthrough Capture-Session (Web-only Recording)

**Version:** V5
**Status:** planned
**Created:** 2026-05-05

## Zweck
Mitarbeiter kann ohne Software-Install eine Walkthrough-Session starten — Bildschirm + Mikrofon werden via Browser-API aufgezeichnet, die Aufnahme landet im Storage. Neuer Capture-Modus (`walkthrough`) parallel zu Questionnaire/Evidence/Voice/Dialogue.

## Hintergrund
V4 hat die Capture-Mode-Hooks etabliert (FEAT-025, walkthrough_stub-Spike). V5 fuellt den Mode mit echtem Inhalt. Tech-Stack: Web-only via `getDisplayMedia` + `getUserMedia` (User-Decision 2026-05-05) — keine Browser-Extension, kein Electron, kein Native-Build.

## In Scope
- Walkthrough-Capture-UI als neuer Mode-Eintrag in `CAPTURE_MODE_REGISTRY`
- Start-Flow: Permission-Prompts (Bildschirm + Mikrofon), Vorschau-Frame, Start/Stopp/Pause-Controls
- MediaRecorder-Integration: Screen-Spur (`getDisplayMedia` ohne Audio) + Mic-Spur (`getUserMedia` audio-only) → kombinierter WebM/VP9+Opus-Stream
- Aufnahme-Status-Anzeige + visuelle Feedback (Pegelmesser fuer Mikrofon optional)
- Max-Dauer-Limit (30min, /architecture klaert genau)
- Upload-Strategie (signed URL Direct-Upload oder Server-Proxy — /architecture)
- `walkthrough_session` Datenmodell (Tabelle oder capture_session-Erweiterung — /architecture)

## Out of Scope
- Whisper-Transkription (FEAT-035)
- Berater-Review (FEAT-036)
- KI-Schritt-Extraktion (V5.1, FEAT-037)
- Klick-Tracking, DOM-Snapshots, Selektor-Erfassung (V6+)
- Mobile-Capture (V6+)

## Akzeptanzkriterien (Skizze)
- Mitarbeiter kann von Capture-Session-Liste den Mode "Walkthrough" waehlen und Aufnahme starten
- Bildschirm + Mikrofon werden simultan erfasst
- Aufnahme landet im `walkthroughs`-Bucket mit Pfad `<tenant_id>/<session_id>/recording.webm`
- Recording-Metadaten (duration_sec, recorded_at) in DB
- RLS verhindert Cross-Tenant- und Cross-Mitarbeiter-Sicht der Roh-Aufnahme

## Abhaengigkeiten
- FEAT-025 (Capture-Mode-Hooks, deployed)
- Migration 067 (capture_mode CHECK enthaelt 'walkthrough', deployed)

## Verweise
- PRD V5-Sektion (SC-V5-1, SC-V5-4)
- /requirements V5 RPT-XXX (2026-05-05)
- DEC offen — Q-V5-A (Tabelle vs. Erweiterung), Q-V5-B (Codec), Q-V5-C (Max-Dauer), Q-V5-D (Upload), Q-V5-E (Audio-Mix)
