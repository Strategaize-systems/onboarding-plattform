# FEAT-020 — Recording-to-Knowledge Pipeline

## Problem Statement

Nach dem Meeting (FEAT-019) existiert eine MP4-Datei. Ohne Verarbeitung bleibt sie eine tote Audiodatei. Der Kern des Dialogue-Mode ist die automatische Umwandlung: Recording → Transkript → strukturierte Knowledge Units + Meeting-Summary + Gap Detection. Erst dadurch wird das Gespraech zu verwertbarem Wissen.

## Goal

Automatische Pipeline: MP4 → Whisper-Transkription → KI-Verarbeitung gegen Meeting Guide → Knowledge Units pro Thema + strukturierte Meeting-Summary + nicht besprochene Themen als Luecken. Ergebnis ist reviewbar fuer beide Teilnehmer und den Auftraggeber.

## Users

- **System (Worker):** Fuehrt Pipeline automatisch nach Meeting-Ende aus
- **strategaize_admin:** Reviewed Ergebnis im Debrief, editiert KUs
- **Auftraggeber (tenant_admin):** Reviewed Meeting-Summary
- **Gespraechspartner:** Sehen Meeting-Summary

## Scope

### In Scope

1. **MP4 → Transkript (Whisper)**
   - Bestehender Whisper-Container (DEC-018) verarbeitet MP4-Audio
   - Transkript wird als Volltext gespeichert (persistent, fuer Re-Analyse)
   - Whisper-Adapter-Pattern wird wiederverwendet (V2 SLC-022)
   - Audio-Extraktion aus MP4 (ffmpeg) falls noetig

2. **Transkript → Knowledge Units (Bedrock)**
   - Neuer Job-Typ `dialogue_extraction` in ai_jobs
   - Worker erhaelt: Transkript + Meeting-Guide (Themen + Leitfragen)
   - KI mappt Gespraechsinhalte auf Meeting-Guide-Themen
   - Pro Thema: Knowledge Units extrahieren (analog zu Questionnaire-KUs)
   - KUs erhalten `source = 'dialogue'`

3. **Gap Detection**
   - KI identifiziert Meeting-Guide-Themen, die nicht oder nur oberflaechlich besprochen wurden
   - Luecken werden als strukturierte Liste gespeichert (analog zu Backspelling-Gaps)
   - Luecken koennen spaeter ein Follow-up-Meeting triggern (V3.1)

4. **Meeting-Summary**
   - KI generiert eine strukturierte Zusammenfassung des Gespraechs
   - Gegliedert nach Meeting-Guide-Themen
   - Enthaelt: Kernaussagen pro Thema, Entscheidungen, offene Punkte, naechste Schritte
   - Gespeichert als JSONB (nicht nur Freitext)

5. **Review-UI**
   - Meeting-Summary sichtbar fuer Auftraggeber + Teilnehmer
   - KUs sichtbar im Debrief-UI (strategaize_admin)
   - Luecken sichtbar im Debrief-UI
   - Transkript als Volltext abrufbar (Audit, Nachvollziehbarkeit)

6. **Status-Tracking**
   - dialogue_session.status wechselt: `completed` → `processing` → `processed` (oder `failed`)
   - Fehlerbehandlung: bei Whisper-Fehler oder Bedrock-Fehler wird `failed` gesetzt + error_log

### Out of Scope

- **Speaker Diarization** (Sprecher-Trennung im Transkript) → /architecture-Entscheidung, ggf. V3.1
- **Echtzeit-Transkription** (waehrend des Meetings) → V3.1
- **Cross-Meeting-Verdichtung** (mehrere Meetings zusammenfuehren) → V3.1+
- **Video-Analyse** (nonverbale Signale, Gestik) → weit spaeter
- **Automatische Follow-up-Meeting-Erstellung aus Luecken** → V3.1

## Acceptance Criteria

**AC-1 — Transkription funktioniert**
MP4 aus Jibri wird automatisch via Whisper transkribiert. Transkript ist als Volltext gespeichert.

**AC-2 — Knowledge Units extrahiert**
KI extrahiert pro Meeting-Guide-Thema mindestens eine Knowledge Unit aus dem Transkript. KUs haben `source = 'dialogue'`.

**AC-3 — Luecken erkannt**
Nicht oder nur oberflaechlich besprochene Themen werden als Luecken aufgelistet.

**AC-4 — Meeting-Summary generiert**
Strukturierte Zusammenfassung (pro Thema: Kernaussagen, Entscheidungen, offene Punkte) wird generiert und gespeichert.

**AC-5 — Summary reviewbar**
Auftraggeber und Teilnehmer koennen die Meeting-Summary in der Plattform-UI einsehen.

**AC-6 — KUs im Debrief**
Dialogue-KUs erscheinen im Debrief-UI neben Questionnaire-KUs.

**AC-7 — Fehlerbehandlung**
Bei Pipeline-Fehler: `failed` Status + error_log Eintrag. Moeglichkeit zum Retry.

**AC-8 — Kosten-Logging**
Token-Verbrauch fuer Dialogue-Extraction wird geloggt (analog zu bestehenden Jobs).

## Pipeline-Architektur (Vorschlag)

```
Meeting Ende (FEAT-019)
    |
    v
[dialogue_session.status = 'completed']
    |
    v
[ai_job: dialogue_transcription]
    |-- MP4 → ffmpeg audio extract → Whisper → transcript TEXT
    |-- Speichern: dialogue_session.transcript
    |
    v
[ai_job: dialogue_extraction]
    |-- Input: transcript + meeting_guide.topics
    |-- Bedrock Claude: Mapping Transkript → Themen
    |-- Output: Knowledge Units (source='dialogue') + Gaps + Summary
    |
    v
[dialogue_session.status = 'processed']
    |
    v
[Review-UI: Summary + KUs + Gaps im Debrief]
```

## Data Model Ergaenzungen (Vorschlag)

```sql
-- Auf dialogue_session (FEAT-019):
ALTER TABLE dialogue_session ADD COLUMN transcript text;
ALTER TABLE dialogue_session ADD COLUMN summary jsonb;
-- summary: { topics: [{ key, title, highlights, decisions, open_points }], overall: text }

-- Gaps koennen in bestehende gap_question-Tabelle (V2) fliessen
-- oder als eigene dialogue_gaps-Spalte auf dialogue_session

-- Knowledge Units nutzen bestehendes Schema:
-- knowledge_unit.source = 'dialogue' (neuer CHECK-Wert)
```

## Risks

- **R12:** Transkriptions-Qualitaet bei 2-Personen-Dialog. Whisper ohne Diarization liefert einen gemischten Text. KI muss trotzdem Themen extrahieren koennen. Mitigation: Prompt-Design das mit undifferenziertem Transkript umgehen kann.
- **Lange Meetings:** 60-Minuten-Meeting = ~17.000 Tokens Transkript. Bedrock-Kosten: ~$0.10-$0.30 pro Verarbeitung. Akzeptabel fuer B2B.
