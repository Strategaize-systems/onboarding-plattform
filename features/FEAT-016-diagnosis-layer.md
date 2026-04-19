# FEAT-016 — Template-driven Diagnosis Layer

## Problem Statement

Nach der KI-Verdichtung (3-Agenten-Loop) existieren Knowledge Units pro Block. Zwischen diesen KUs und einer operativen Handlungsplanung (SOPs) fehlt der zentrale Produktschritt: eine **strukturierte Diagnose pro Unterthema**, die als Meeting-Vorbereitung dient und mit dem Auftraggeber (GF, Vertriebsleiter, Knowledge Manager) durchgegangen wird.

Ohne diesen Schritt springt die Plattform von Rohdaten-Verdichtung direkt zu Handlungsplaenen — der Auftraggeber hat keine Moeglichkeit, die Analyse zu pruefen, Prioritaeten zu setzen und ueber naechste Schritte zu entscheiden, bevor operative Plaene erstellt werden.

## Goal

KI generiert pro Block eine strukturierte Diagnose im template-spezifischen Format. Die Diagnose wird pro Unterthema ausgefuellt, ist editierbar, exportierbar und dient als Grundlage fuer ein Meeting mit dem Auftraggeber. Erst nach Bestaetigung der Diagnose wird SOP-Generierung freigeschaltet.

## Users

- **strategaize_admin:** Generiert Diagnose, reviewed und bereitet Meeting vor, editiert Vorschlaege
- **Auftraggeber (tenant_admin):** Sieht Diagnose im Meeting, diskutiert Prioritaeten, bestaetigt oder korrigiert (Meeting ist aktuell ausserhalb der Plattform — Plattform liefert die Unterlage)

## Scope

### In Scope

1. **Template-Erweiterung: `diagnosis_schema`**
   - Neues JSONB-Feld `diagnosis_schema` am `template`
   - Definiert pro Block: Liste der Unterthemen (Subtopics) mit Name und Zuordnung zu Fragen
   - Definiert die Bewertungsfelder (Spalten), die pro Unterthema generiert werden sollen
   - Exit-Readiness-Beispiel: Ist-Situation, Ampel, Reifegrad (0-10), Risiko (0-10), Hebel (0-10), 90-Tage-Relevanz, Empfehlung/Massnahme, Belege/Zitate/Quelle, Owner (Intern), Aufwand (S/M/L), Naechster Schritt, Abhaengigkeiten/Blocker, Zielbild (DOD)
   - Andere Templates koennen voellig andere Bewertungsfelder definieren

2. **Diagnose-Generierung (KI)**
   - Neuer Job-Typ `diagnosis_generation` in ai_jobs
   - Worker nimmt Knowledge Units eines Blocks + `diagnosis_schema` des Templates
   - KI analysiert KUs pro Unterthema und fuellt die Bewertungsfelder vor
   - Prompt ist template-spezifisch (analog zu `sop_prompt` → `diagnosis_prompt`)
   - Output wird als JSONB in neuer `block_diagnosis`-Tabelle gespeichert

3. **Diagnose-Tabelle: `block_diagnosis`**
   - `id`, `tenant_id`, `capture_session_id`, `block_key`, `block_checkpoint_id`
   - `content jsonb` — Array von Subtopic-Eintraegen, jeder mit den template-definierten Feldern
   - `status text` — `draft | reviewed | confirmed`
   - `generated_by_model`, `cost_usd`, `created_by`, `created_at`, `updated_at`
   - RLS: strategaize_admin full, tenant_admin read own

4. **Diagnose-UI im Debrief**
   - "Diagnose generieren" Button (analog zu SOP-Button, nur fuer strategaize_admin)
   - Strukturierte Anzeige: Tabelle oder Karten pro Unterthema mit allen Bewertungsfeldern
   - Inline-Editing aller Felder (analog zu SopEditor)
   - Ampel-Visualisierung (gruen/gelb/rot)
   - "Diagnose bestaetigen" Button → setzt Status auf `confirmed`
   - Export-Button (JSON, spaeter CSV/Excel)

5. **SOP-Gate**
   - SOP-Generierung nur verfuegbar wenn Diagnose-Status = `confirmed`
   - SOP-Button zeigt Hinweis wenn Diagnose noch nicht bestaetigt

6. **Exit-Readiness Diagnose-Schema**
   - Erstes konkretes `diagnosis_schema` fuer das Exit-Readiness Template
   - Subtopics pro Block aus bestehendem Template-Content abgeleitet
   - 13 Bewertungsfelder wie im Referenz-Excel

7. **i18n**
   - Diagnose-spezifische Keys in de/en/nl

### Out of Scope

- **Diagnose-Versionierung** (mehrere Diagnose-Versionen pro Block) → V2.1
- **Diagnose-Sharing mit Auftraggeber via Plattform** (Meeting passiert aktuell ausserhalb) → V3 mit Meeting-Mode
- **CSV/Excel-Export** (V2-Scope ist JSON, CSV/Excel als V2.1 Erweiterung)
- **Template-Editor fuer diagnosis_schema** (V3 — aktuell per Migration)
- **Cross-Block-Diagnose** (block-uebergreifende Analyse) → V3
- **Automatischer Diagnose-Trigger** (aktuell on-click, nicht nach Verdichtung) → spaeter evaluieren

## Acceptance Criteria

**AC-1 — Template hat diagnosis_schema**
Das Exit-Readiness Template hat ein `diagnosis_schema` JSONB-Feld mit Subtopics und Bewertungsfeldern pro Block.

**AC-2 — Diagnose wird generiert**
Button "Diagnose generieren" triggert KI-Analyse. KI fuellt pro Unterthema alle Bewertungsfelder vor (Ist-Situation, Ampel, Reifegrad, etc.). Ergebnis wird in `block_diagnosis` gespeichert.

**AC-3 — Diagnose wird strukturiert angezeigt**
Diagnose-Daten werden im Debrief-UI als Tabelle/Karten dargestellt. Alle Bewertungsfelder sind sichtbar. Ampel wird farblich visualisiert.

**AC-4 — Diagnose ist editierbar**
Alle Felder sind inline editierbar. Save speichert via RPC.

**AC-5 — Diagnose kann bestaetigt werden**
Button "Diagnose bestaetigen" setzt Status auf `confirmed`. Danach ist das SOP-Feature freigeschaltet.

**AC-6 — SOP erst nach Diagnose-Bestaetigung**
SOP-Button erscheint nur wenn `block_diagnosis.status = 'confirmed'`. Vorher: Hinweis "Erst Diagnose bestaetigen".

**AC-7 — JSON-Export**
Export-Button downloadet Diagnose als JSON-Datei.

**AC-8 — i18n komplett**
Diagnose-Keys in de/en/nl vorhanden.

## Data Model

### block_diagnosis

```sql
CREATE TABLE block_diagnosis (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text        NOT NULL,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  content               jsonb       NOT NULL,  -- Array of subtopic entries
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'reviewed', 'confirmed')),
  generated_by_model    text        NOT NULL,
  cost_usd              numeric(10,6),
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

### diagnosis_schema (auf template)

```json
{
  "blocks": {
    "A": {
      "subtopics": [
        {
          "key": "kernlogik",
          "name": "Kernlogik Geschaeftsmodell",
          "question_keys": ["A1", "A2"]
        }
      ]
    }
  },
  "fields": [
    { "key": "ist_situation", "label": "Beschreibung Ist-Situation", "type": "text" },
    { "key": "ampel", "label": "Ampel", "type": "enum", "options": ["green", "yellow", "red"] },
    { "key": "reifegrad", "label": "Reifegrad", "type": "number", "min": 0, "max": 10 },
    { "key": "risiko", "label": "Risiko", "type": "number", "min": 0, "max": 10 },
    { "key": "hebel", "label": "Hebel", "type": "number", "min": 0, "max": 10 },
    { "key": "relevanz_90d", "label": "90-Tage-Relevanz", "type": "enum", "options": ["high", "medium", "low"] },
    { "key": "empfehlung", "label": "Empfehlung / Massnahme", "type": "text" },
    { "key": "belege", "label": "Belege / Zitate / Quelle", "type": "text" },
    { "key": "owner", "label": "Owner (Intern)", "type": "text" },
    { "key": "aufwand", "label": "Aufwand", "type": "enum", "options": ["S", "M", "L"] },
    { "key": "naechster_schritt", "label": "Naechster Schritt", "type": "text" },
    { "key": "abhaengigkeiten", "label": "Abhaengigkeiten/Blocker", "type": "text" },
    { "key": "zielbild", "label": "Zielbild (DOD)", "type": "text" }
  ]
}
```

### Diagnosis Content (gespeichert in block_diagnosis.content)

```json
{
  "block_key": "A",
  "block_title": "Geschaeftsmodell & Markt",
  "subtopics": [
    {
      "key": "kernlogik",
      "name": "Kernlogik Geschaeftsmodell",
      "fields": {
        "ist_situation": "Das Geschaeftsmodell basiert auf...",
        "ampel": "yellow",
        "reifegrad": 6,
        "risiko": 4,
        "hebel": 7,
        "relevanz_90d": "high",
        "empfehlung": "Kernleistung schaerfen...",
        "belege": "Antwort A1: '...'",
        "owner": "",
        "aufwand": "M",
        "naechster_schritt": "",
        "abhaengigkeiten": "",
        "zielbild": ""
      }
    }
  ]
}
```

## Relationship to Existing Features

- **FEAT-010 (Orchestrator):** Diagnose basiert auf den KUs, die der Orchestrator produziert. Keine Aenderung am Orchestrator.
- **FEAT-011 (Backspelling):** Backspelling laeuft VOR der Diagnose. Diagnose erst sinnvoll, wenn KU-Qualitaet ausreichend.
- **FEAT-012 (SOP):** SOP wird durch Diagnose-Gate geschuetzt. SOP-Code bleibt, Button-Sichtbarkeit aendert sich.
- **FEAT-013 (Evidence):** Belege/Zitate-Feld in der Diagnose kann spaeter auf Evidence-Daten verlinken.

## Risks

- **R10 — Subtopic-Zuordnung:** Die Qualitaet der Diagnose haengt davon ab, wie gut KUs den Subtopics zugeordnet werden koennen. Mitigation: Zuordnung ueber question_keys im Schema, KI-Prompt erhaelt sowohl KUs als auch die Subtopic-Definitionen.
- **R11 — Prompt-Qualitaet:** Ein generischer Prompt fuer 13 Bewertungsfelder pro Subtopic ist komplex. Mitigation: Iterative Prompt-Verbesserung, Start mit Exit-Readiness, Learnings auf weitere Templates uebertragen.
- **R12 — Leere Felder:** KI kann nicht alle Felder sinnvoll fuer alle Subtopics fuellen (z.B. Owner ist organisationsspezifisch). Mitigation: Leere Felder sind erlaubt und erwuenscht — der Mensch fuellt sie im Meeting.

## Open Questions

- **Q12 — Subtopic-Granularitaet:** Wie fein sollen Subtopics sein? 1:1 mit Fragen oder thematisch gruppiert (2-3 Fragen pro Subtopic)? Empfehlung: thematisch gruppiert, da die Diagnose auf Themenebene arbeitet, nicht auf Fragenebene.
- **Q13 — Meeting-Export-Format:** JSON ist V2-Minimum. Soll die Tabellen-Ansicht auch als druckbare HTML-Seite verfuegbar sein (Print-CSS)? Das waere ein einfacher Quick-Win fuer Meeting-Unterlagen.
