# FEAT-019 — Dialogue Session (Video-Call + Recording)

## Problem Statement

Die Jitsi-Infrastruktur (FEAT-017) stellt die technische Basis bereit. Jetzt muss die Plattform es ermoeglichen, aus einer Capture-Session heraus ein Meeting zu starten, Teilnehmer zuzuweisen, das Meeting aufzuzeichnen und den Meeting-Guide als Referenz anzuzeigen. Ohne diese Integration bleibt Jitsi ein isolierter Video-Dienst ohne Verbindung zum Onboarding-Workflow.

## Goal

Zwei Teilnehmer koennen aus der Plattform heraus ein Video-Meeting starten. Das Meeting wird aufgezeichnet (Jibri). Der Meeting-Guide (FEAT-018) ist waehrend des Gespraechs als Referenz sichtbar. Die Plattform verwaltet Meeting-Sessions mit Status, Teilnehmer-Zuordnung und Recording-Verknuepfung.

## Users

- **Auftraggeber (strategaize_admin / tenant_admin):** Erstellt Meeting-Session, weist Teilnehmer zu, startet/plant Meeting
- **Gespraechspartner A + B:** Treten dem Meeting bei, fuehren das Gespraech, sehen Meeting-Guide als Referenz
- **Jibri (System):** Zeichnet auf, produziert MP4

## Scope

### In Scope

1. **Meeting-Session-Management**
   - Neue Meeting-Session innerhalb einer Capture-Session erstellen
   - Capture-Session bekommt neuen Mode: `dialogue` (neben `questionnaire`, `evidence`)
   - Meeting-Status: `planned`, `in_progress`, `recording`, `completed`, `processing`, `processed`
   - Teilnehmer-Zuordnung (2 Personen)

2. **Jitsi-Integration in Plattform-UI**
   - Jitsi-Embed (IFrame API) oder direkter Link zum Meeting-Raum
   - JWT wird pro Teilnehmer generiert (Name, Rolle, Tenant)
   - Meeting-Raum-Name wird automatisch generiert (Session-ID-basiert)
   - Aufnahme-Hinweis/Consent vor Meeting-Start (DSGVO)

3. **Meeting-Guide im Call**
   - Seitenpanel oder Overlay mit Meeting-Guide-Themen
   - Teilnehmer sehen Themen + Leitfragen als Referenz
   - Optional: Themen als "besprochen" markieren

4. **Recording-Steuerung**
   - Automatischer Recording-Start bei Meeting-Beginn (oder manuell)
   - Recording-Stop bei Meeting-Ende
   - MP4-Speicherung im Recording-Volume
   - Recording-Datei wird mit Meeting-Session verknuepft

5. **Meeting-Abschluss**
   - Meeting-Ende → Status wechselt zu `completed`
   - Recording-Datei ist verfuegbar fuer FEAT-020 (Pipeline)
   - Trigger fuer Transkription (automatisch oder on-demand)

### Out of Scope

- **Mehr als 2 Teilnehmer** → V3.1 (Gruppen-Meetings)
- **Screensharing-Recording** → V4 (Walkthrough-Mode)
- **Meeting-Planung mit Kalender-Integration** → V3.1+
- **Chat im Meeting** (Jitsi-eigener Chat ist verfuegbar, aber nicht Plattform-integriert) → V3.1
- **Mid-Meeting-KI** (Live-Zusammenfassung, Rueckfragen) → V3.1

## Acceptance Criteria

**AC-1 — Meeting-Session erstellen**
Auftraggeber kann innerhalb einer Capture-Session eine Dialogue-Session erstellen mit Teilnehmer-Zuordnung.

**AC-2 — Jitsi-Meeting beitreten**
Beide Teilnehmer koennen ueber die Plattform dem Meeting beitreten (JWT-authentifiziert).

**AC-3 — Consent vor Aufnahme**
Vor Meeting-Start sehen beide Teilnehmer einen Aufnahme-Hinweis und muessen zustimmen.

**AC-4 — Recording laeuft**
Meeting wird aufgezeichnet (Jibri). MP4-Datei entsteht im Recording-Volume.

**AC-5 — Meeting-Guide sichtbar**
Waehrend des Meetings sind die Guide-Themen als Referenz sichtbar (Seitenpanel oder abrufbar).

**AC-6 — Meeting-Ende**
Bei Meeting-Ende wechselt der Status. Recording-Datei ist mit der Session verknuepft.

**AC-7 — Transkription wird getriggert**
Nach Meeting-Ende wird automatisch oder on-demand die Transkription ausgeloest (FEAT-020).

## Data Model (Vorschlag — Entscheidung in /architecture)

```sql
CREATE TABLE dialogue_session (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  meeting_guide_id      uuid        REFERENCES meeting_guide,
  jitsi_room_name       text        NOT NULL,
  status                text        NOT NULL DEFAULT 'planned'
                                    CHECK (status IN ('planned','in_progress','recording','completed','processing','processed','failed')),
  participant_a_user_id uuid        REFERENCES auth.users,
  participant_b_user_id uuid        REFERENCES auth.users,
  participant_b_email   text,       -- Falls Guest-Mode (kein Account)
  recording_path        text,       -- Pfad zur MP4 im Volume/Storage
  recording_duration_s  integer,    -- Laenge in Sekunden
  started_at            timestamptz,
  ended_at              timestamptz,
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

## Risks

- **Jitsi IFrame API Einschraenkungen:** Manche Browser blockieren Mikrofon/Kamera in IFrames. Fallback: direkter Link.
- **Recording-Zuverlaessigkeit:** Jibri kann bei langen Meetings (>60min) instabil werden. Mitigation: Monitoring + Finalize-Script.
