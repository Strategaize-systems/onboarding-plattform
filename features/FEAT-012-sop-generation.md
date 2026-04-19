# FEAT-012 — SOP Generation (Level 2)

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Generiert aus verdichteten Knowledge Units eines Blocks eine Standard Operating Procedure (SOP). SOPs sind die zweite Verdichtungsebene: waehrend Knowledge Units den IST-Zustand analysieren, beschreiben SOPs den konkreten Handlungsplan.

## Why it matters
Exit-Readiness-Kunden brauchen nicht nur eine Analyse ihrer Situation, sondern konkrete Handlungsschritte. "Nachfolge ist nicht geregelt" (KU) wird zu "Schritt 1: Nachfolger-Profil definieren, Schritt 2: Marktanalyse beauftragen, ..." (SOP). Ohne SOP-Generierung bleibt der Berater in der Pflicht, Handlungsplaene manuell zu schreiben — widerspricht dem Skalierungsversprechen.

## How SOP Generation works

### Flow
1. **Trigger:** On-demand per Button im Debrief-UI ("SOP generieren"), NICHT automatisch nach Verdichtung.
2. **Input:** Alle Knowledge Units des Blocks + Orchestrator-Quality-Report (FEAT-010).
3. **Generation:** Dedizierter Bedrock-Prompt erzeugt SOP im strukturierten Format:
   - Titel (abgeleitet aus Block-Name)
   - Ziel / Outcome
   - Voraussetzungen
   - Schritte (nummeriert, jeweils mit Verantwortlichkeit, Zeitrahmen, Erfolgskriterium)
   - Abhaengigkeiten zwischen Schritten
   - Risiken / Fallbacks
4. **Persistierung:** SOP als neue Entitaet `sop` (oder JSONB auf block_checkpoint).
5. **Review:** strategaize_admin kann SOP im Debrief-UI reviewen und editieren.
6. **Export:** SOP ist exportierbar (JSON in V2, Markdown/PDF in V2.1).

### Template-Spezifitaet
SOP-Format und Prompt sind template-spezifisch. Exit-Readiness-SOPs haben andere Struktur als Mitarbeiter-Onboarding-SOPs. Der SOP-Prompt wird als Template-Feld gespeichert (nicht hardcoded).

## In Scope
- SOP-Generierungs-Prompt (template-spezifisch)
- SOP-Datenstruktur (DB-Tabelle oder JSONB)
- SOP-Generierung per Button im Debrief-UI
- SOP-Anzeige im Debrief-UI (read-only + Edit)
- SOP-Export (JSON)
- Kosten-Logging pro SOP-Generierung

## Out of Scope
- PDF/Markdown-Export (V2.1)
- SOP-Versionierung (V2.1 — V2 hat nur einen aktiven SOP-Stand pro Block)
- Cross-Block-SOP (block-uebergreifender Gesamtplan, V3)
- SOP-Templates-Editor-UI (V2.1+, V2 per Migration)

## Success Criteria
- strategaize_admin kann pro Block SOP generieren
- SOP enthaelt: Ziel, Schritte mit Verantwortlichkeit/Zeitrahmen, Risiken
- SOP ist im Debrief-UI sichtbar und editierbar
- SOP ist als JSON exportierbar
- Kosten pro SOP-Generierung sind protokolliert

## Cost Estimate
- 1 Bedrock-Call pro SOP-Generierung
- ~5K-10K Tokens (KUs als Input + SOP als Output)
- Geschaetzt: $0.05-$0.10 pro Block-SOP
- Pro Session (9 Blocks): $0.45-$0.90

## Dependencies
- FEAT-005 (Knowledge Units als Input)
- FEAT-010 (Quality-Report als Qualitaets-Signal)
- FEAT-006 (Debrief-UI als Host)

## Related
- DEC-009 (V1 nur JSON-Export — SOP folgt gleichem Prinzip)
