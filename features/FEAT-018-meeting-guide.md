# FEAT-018 — Meeting Guide (Basic)

## Problem Statement

Ohne Vorbereitung sind Wissenserhebungs-Meetings unstrukturiert — Teilnehmer reden aneinander vorbei, wichtige Themen werden vergessen, das Gespraech driftet ab. Der Auftraggeber (Knowledge Manager, GF, Berater) braucht die Moeglichkeit, vorab eine Struktur vorzugeben: welche Themen besprochen werden sollen, welche Fragen zu beantworten sind und welche Ziele das Meeting hat.

## Goal

Auftraggeber kann pro Capture-Session einen Meeting-Guide erstellen: Themen, Leitfragen und Ziele. Basismässige KI-Unterstuetzung (Vorschlaege aus Template-Kontext), aber der Auftraggeber macht die Hauptarbeit selbst. Meeting-Guide dient als Referenz waehrend des Gespraechs (FEAT-019) und als Mapping-Vorlage fuer die KI-Verarbeitung (FEAT-020).

## Produkt-Split Kontext

Dies ist die **Basis-Variante**. Die volle KI-gestuetzte Meeting-Vorbereitung (granulare Fragen aus bestehendem Wissen, Learnings, Analyse) gibt es nur mit der Intelligence Platform als separatem Produkt. Dieser Split ist ein bewusster kommerzieller Entscheid — die Onboarding-Plattform bietet genug, um nuetzlich zu sein, aber nicht so viel, dass die Intelligence Platform wertlos wird.

## Users

- **strategaize_admin:** Erstellt Meeting-Guide mit vollem Zugriff, kann fuer alle Tenants
- **tenant_admin:** Erstellt Meeting-Guide fuer eigene Sessions (Kunden-internes Knowledge Management)

## Scope

### In Scope

1. **Meeting-Guide Datenmodell**
   - Pro Capture-Session ein Meeting-Guide (1:1 Beziehung)
   - Themen (Topics) als strukturierte Liste: Titel, Beschreibung, optional Leitfragen
   - Ziele (Goals) fuer das gesamte Meeting
   - Kontext-Notizen (freitext, fuer Hintergrund-Info)

2. **Meeting-Guide Editor UI**
   - Erstellen/Bearbeiten im Session-Kontext
   - Themen hinzufuegen, sortieren, loeschen
   - Leitfragen pro Thema (optional, frei formulierbar)
   - Meeting-Ziel definieren (Freitext)
   - Kontext-Notizen (Freitext)

3. **KI-Vorschlaege (Basic)**
   - Button "Vorschlaege generieren" — KI schlaegt Themen und Leitfragen vor
   - Basiert auf: Template-Bloecke + Fragen des aktiven Templates
   - Optional: vorhandene Antworten (wenn Session bereits Questionnaire-Daten hat) als Kontext
   - Vorschlaege koennen uebernommen, angepasst oder verworfen werden
   - Explizit NICHT enthalten: Analyse bestehenden Wissens, Luecken-basierte Fragen, Intelligence-Level-Vorbereitung

4. **Meeting-Guide als Export**
   - JSON-Export fuer maschinelle Weiterverarbeitung (FEAT-020 nutzt dies)
   - Druckbare Ansicht (Print-CSS) fuer Papier-Vorbereitung

### Out of Scope

- **Intelligence-Level Vorbereitung** (KI analysiert bestehende KUs und generiert gezielte Fragen) → Intelligence Platform
- **Meeting-Guide-Templates** (vorgefertigte Guide-Vorlagen) → V3.1
- **Automatische Themen-Priorisierung** (KI schlaegt Reihenfolge vor basierend auf Dringlichkeit) → V3.1+
- **Kollaboratives Editing** (mehrere User bearbeiten Guide gleichzeitig) → nicht noetig in V3

## Acceptance Criteria

**AC-1 — Meeting-Guide erstellen**
Auftraggeber kann fuer eine Capture-Session einen Meeting-Guide mit mindestens 3 Themen + Leitfragen + Meeting-Ziel erstellen.

**AC-2 — Themen verwalten**
Themen koennen hinzugefuegt, sortiert (Drag-and-Drop oder Pfeil-Buttons), bearbeitet und geloescht werden.

**AC-3 — KI-Vorschlaege**
Button "Vorschlaege generieren" liefert thematische Vorschlaege basierend auf dem aktiven Template. Vorschlaege erscheinen als uebernehmbare Chips/Karten.

**AC-4 — Guide persistent**
Meeting-Guide wird gespeichert und ist bei erneutem Oeffnen vollstaendig vorhanden.

**AC-5 — Print-Ansicht**
Druckbare Ansicht des Meeting-Guide (sauberes Layout, keine UI-Chrome).

**AC-6 — RLS-Isolation**
tenant_admin sieht nur eigene Meeting-Guides. strategaize_admin sieht alle.

## Data Model (Vorschlag — Entscheidung in /architecture)

```sql
CREATE TABLE meeting_guide (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  goal                  text,           -- Gesamtziel des Meetings
  context_notes         text,           -- Hintergrund-Informationen
  topics                jsonb       NOT NULL DEFAULT '[]',
  -- topics: [{ key, title, description, questions: [string], order }]
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(capture_session_id)  -- 1:1 pro Session
);
```

## Risks

- **R13:** "Basic" muss trotzdem nuetzlich sein. Mitigation: Template-basierte KI-Vorschlaege liefern einen guten Startpunkt.
