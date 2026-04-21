# FEAT-021 — Dialogue Pipeline Integration

## Problem Statement

FEAT-020 erzeugt Knowledge Units, Luecken und eine Meeting-Summary aus Dialogue-Sessions. Ohne Integration in die bestehende V2-Pipeline (Diagnose-Layer, SOP-Generation, Debrief-Meeting) bleibt der Dialogue-Output ein isolierter Datensatz. Der Dialogue-Mode muss ein **gleichwertiger Capture-Mode** sein — seine Ergebnisse muessen dieselbe Weiterverarbeitungs-Kette durchlaufen wie Questionnaire- oder Evidence-Output.

## Goal

Dialogue ist ein vollwertiger Capture-Mode: KUs aus Gespraechen fliessen in den Diagnose-Layer, SOPs koennen aus Dialogue-KUs generiert werden, das Debrief-UI zeigt Dialogue-Sessions gleichwertig an. Der Auftraggeber sieht keinen Unterschied in der Weiterverarbeitung — nur die Quelle (Fragebogen vs. Dokument vs. Gespraech) unterscheidet sich.

## Users

- **strategaize_admin:** Nutzt Debrief-UI mit Dialogue-basierten KUs fuer Diagnose und SOP
- **tenant_admin:** Sieht Dialogue-Sessions gleichwertig neben Questionnaire-Sessions im Dashboard

## Scope

### In Scope

1. **capture_session: Neuer Mode `dialogue`**
   - `capture_mode` auf capture_session erhaelt neuen Wert `dialogue`
   - Dashboard zeigt Dialogue-Sessions mit eigenem Icon/Badge
   - Session-Erstellung erlaubt Mode-Auswahl (Questionnaire, Evidence, Dialogue)

2. **Knowledge Units mit source='dialogue' in Diagnose-Layer**
   - Diagnose-Generierung (FEAT-016) kann KUs mit source='dialogue' verarbeiten
   - Kein Code-Change am Diagnose-Prompt noetig (KUs sind KUs, unabhaengig von Quelle)
   - Diagnose-UI zeigt Dialogue-KUs gleichwertig

3. **SOP-Generation aus Dialogue-KUs**
   - SOP-Generation (FEAT-012) verarbeitet auch Dialogue-KUs
   - Kein Code-Change noetig (SOPs basieren auf KUs, nicht auf Quelle)

4. **Debrief-UI Erweiterung**
   - Debrief zeigt fuer Dialogue-Sessions: Meeting-Summary, Transkript-Link, Luecken
   - KU-Editor zeigt source='dialogue' als Badge
   - Transkript ist als Volltext abrufbar (Audit-Nachweis)

5. **Dashboard: Dialogue-Sessions**
   - Dashboard-Liste zeigt Dialogue-Sessions mit Status
   - Klick fuehrt zur Dialogue-Session-Uebersicht (Guide, Meeting-Status, Summary, KUs)

6. **Block-Zuordnung**
   - Meeting-Guide-Themen werden Template-Bloecken zugeordnet
   - KUs werden entsprechend den richtigen Bloecken zugewiesen
   - Diagnose pro Block funktioniert auch mit gemischten Quellen (Questionnaire + Dialogue)

### Out of Scope

- **Hybride Sessions** (gleichzeitig Questionnaire + Dialogue in einer Session) → V3.1, evaluieren
- **Questionnaire-Nacharbeit aus Dialogue-Luecken** (Luecken als neue Fragen zurueckspielen) → V3.1
- **Dialogue-spezifische Diagnose-Felder** (z.B. "Gespraechsdynamik", "Konsens-Level") → V3.1+
- **Cross-Source-Verdichtung** (Questionnaire + Evidence + Dialogue zusammen verdichten) → V4

## Acceptance Criteria

**AC-1 — capture_mode='dialogue' verfuegbar**
Neue Sessions koennen mit Mode `dialogue` erstellt werden. Dashboard zeigt den Mode korrekt an.

**AC-2 — Diagnose aus Dialogue-KUs**
Diagnose-Generierung funktioniert fuer einen Block, der (auch) Dialogue-KUs enthaelt.

**AC-3 — SOP aus Dialogue-KUs**
SOP-Generierung funktioniert fuer einen Block mit Dialogue-KUs.

**AC-4 — Debrief zeigt Dialogue-Kontext**
Debrief-UI zeigt Meeting-Summary, Transkript-Link und Dialogue-spezifische Luecken.

**AC-5 — KU-Source sichtbar**
Im KU-Editor/Debrief ist `source='dialogue'` als Badge/Label sichtbar, um Herkunft der KUs nachzuvollziehen.

**AC-6 — Block-Zuordnung funktioniert**
KUs aus Dialogue werden den richtigen Template-Bloecken zugeordnet. Diagnose pro Block funktioniert mit gemischten Quellen.

**AC-7 — Keine Regression**
Bestehende Questionnaire- und Evidence-Sessions funktionieren unveraendert. Diagnose/SOP fuer bestehende KUs unbeeintraechtigt.

## Integration Points

```
Dialogue-Session
    |
    v
FEAT-020: KUs (source='dialogue') + Gaps + Summary
    |
    +--→ knowledge_unit (bestehende Tabelle, neuer source-Wert)
    |
    +--→ FEAT-016 Diagnose-Layer (KUs → Diagnose, egal ob source=questionnaire|evidence|dialogue)
    |
    +--→ FEAT-012 SOP-Generation (KUs → SOPs, quellen-agnostisch)
    |
    +--→ FEAT-006 Debrief-UI (zeigt KUs + Summary + Gaps)
    |
    +--→ Dashboard (zeigt Dialogue-Sessions mit Status)
```

## Risks

- **Block-Zuordnungs-Qualitaet:** Meeting-Guide-Themen muessen sauber auf Template-Bloecke gemappt werden. Wenn das Mapping ungenau ist, landen KUs in falschen Bloecken. Mitigation: Mapping in FEAT-018 (Meeting-Guide) bereits auf Template-Bloecke referenzieren.
