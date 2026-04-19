# FEAT-015 — Voice Input (Whisper)

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Aktiviert den deaktivierten Mic-Button im Questionnaire (ISSUE-014). Kunden koennen Antworten per Sprache diktieren. Server-side Whisper transkribiert Audio zu Text, der als Antwort eingefuegt wird.

## Why it matters
Natuerliche Sprache ist der schnellste Weg, Wissen zu artikulieren. Gerade Geschaeftsfuehrer, die wenig Zeit haben und nicht gern tippen, profitieren massiv von Voice-Input. Das Business System V4.1 hat Whisper bereits erfolgreich deployed (SLC-413/414) — das Pattern ist erprobt.

## How it works

### Flow
1. **Aufnahme:** Kunde klickt Mic-Button im Questionnaire, spricht.
2. **Upload:** Audio-Blob wird an Transkriptions-Endpoint gesendet.
3. **Transkription:** Whisper-Container transkribiert Audio zu Text.
4. **Einfuegung:** Transkript wird als Antwort-Text eingefuegt (ueberschreibt oder ergaenzt bestehenden Text, je nach UI-Entscheidung).

### Infrastruktur-Optionen (Q9)
**Option A — Shared Whisper (Business System):**
- Business System (91.98.20.191) hat bereits Whisper-Container (faster-whisper, DEC-035 im Business-Repo)
- Onboarding-App ruft Whisper cross-server (HTTP intern oder exposed Endpoint)
- Vorteil: Keine zusaetzliche Whisper-Instanz, kein zusaetzlicher RAM
- Nachteil: Cross-Server-Latenz, Abhaengigkeit von Business-Server-Uptime

**Option B — Lokaler Whisper auf Onboarding-Server:**
- Eigener Whisper-Container auf 159.69.207.29
- Vorteil: Keine Cross-Server-Abhaengigkeit, geringere Latenz
- Nachteil: CPX62 hat 16 GB RAM — muss pruefen ob genug fuer App + Supabase + Whisper

**Option C — Azure Whisper EU:**
- Azure Speech API in EU-Region (westeurope/germanywestcentral)
- Vorteil: Kein eigener Container, skaliert automatisch
- Nachteil: Zusaetzlicher Cloud-Provider, Kosten pro Minute

Entscheidung in /architecture.

### Transkriptions-Endpoint
- `POST /api/capture/[sessionId]/transcribe`
- Request: multipart/form-data mit Audio-Blob
- Response: { text: string, duration_ms: number }
- RLS: Nur der Session-Owner darf transkribieren

### DSGVO-Konformitaet
Audio-Daten werden nur fuer die Dauer der Transkription gehalten. Nach Transkription: Audio wird geloescht, nur Text bleibt. Kein persistentes Audio-Speichern in V2. Whisper laeuft in EU (egal welche Option).

## In Scope
- Mic-Button reaktivieren (whisperEnabled = true, conditional)
- Transkriptions-Endpoint fuer Capture-Sessions
- Whisper-Integration (eine der drei Optionen)
- Audio-Cleanup nach Transkription
- Kosten-Logging (bei Azure-Option)
- Latenz-Monitoring

## Out of Scope
- Persistentes Audio-Speichern (V3, relevant fuer Dialogue-Mode)
- Voice-basierte Navigation (V3+)
- Echtzeit-Transkription / Live-Untertitel (V3+)
- Voice-Input in Backspelling-Antworten (V2.1, nach Voice-Baseline stabil)

## Success Criteria
- Mic-Button ist aktiv im Questionnaire
- Sprache wird transkribiert und als Text eingefuegt
- Transkription dauert < 10 Sekunden fuer 60 Sekunden Audio
- Audio wird nach Transkription nicht persistiert
- Whisper laeuft in EU (DSGVO-konform)

## Dependencies
- ISSUE-014 (Whisper-Stub existiert bereits im Code)
- Whisper-Infrastruktur (Q9 — Entscheidung in /architecture)
- Business System V4.1 Whisper-Adapter als Referenz

## Related
- DEC-035 (Business System: Whisper via Azure, nicht OpenAI direkt)
- Data-Residency-Regel (nur EU-Endpoints)
