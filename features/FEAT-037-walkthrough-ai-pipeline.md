# FEAT-037 — Walkthrough AI-Pipeline (PII-Redaction + Schritt-Extraktion)

**Version:** V5.1
**Status:** planned
**Created:** 2026-05-05

## Zweck
Whisper-Transkript einer Walkthrough-Session wird durch Bedrock-Claude (eu-central-1) in zwei Pipeline-Stufen verarbeitet:
1. **PII-Redaction-Pass** maskiert sensitive Daten (Kundennamen, E-Mail, IBAN, Preise, IDs)
2. **Schritt-Extraktion-Pass** erzeugt strukturierte Schritt-Liste (analog SopStep) + Knowledge Units

Berater bekommt im Review-UI nicht mehr nur Roh-Transkript, sondern KI-Vorschlaege als Editier-Vorlage.

## Hintergrund
V5 macht den manuellen Pfad. V5.1 reduziert Berater-Aufwand durch KI-Vorbereitung. Stack-Reuse: Bedrock-Adapter aus V2 (FEAT-005, FEAT-010) + SOP-Pattern aus V2 (FEAT-012).

## In Scope
- **PII-Redaction-Worker-Job**
  - Input: Walkthrough-Transkript (knowledge_unit mit source='walkthrough_transcript')
  - Bedrock-Claude-Pass mit konservativer PII-Pattern-Liste
  - Output: Redacted-Transkript mit Platzhaltern (`[KUNDE]`, `[EMAIL]`, `[BETRAG]`, `[ID]`, `[INTERN]`)
  - Original-Transkript bleibt unveraendert in DB; Redacted-Version landet als separater knowledge_unit-Eintrag
- **Schritt-Extraktion-Worker-Job**
  - Input: Redacted-Transkript + Walkthrough-Metadaten
  - Bedrock-Claude-Pass mit Schritt-Strukturierungs-Prompt (analog V2 SOP-Generation)
  - Output: SopStep-Liste (number, action, responsible, timeframe, success_criterion, dependencies) + Knowledge-Unit-Liste mit source='walkthrough'
- **PII-Pattern-Library**
  - Wiederverwendbare Pattern-Defs unter `src/lib/ai/pii-patterns/`
  - Synthetische Test-Suite fuer Pattern-Coverage-Verifikation
- **Pipeline-Trigger**
  - Auto-Trigger bei `walkthrough_review.status = approved`
  - Job-Reihenfolge: PII-Redaction → Schritt-Extraktion (sequenziell, nicht parallel)

## Out of Scope
- Video-Level-PII-Redaction (Computer-Vision) — kommt erst bei explizitem Kundenwunsch
- Mehrsprachige Pattern-Library (DE only fuer V5.1)
- Cross-Walkthrough-Konsistenz-Pruefung (V6+)
- Per-Tenant-Pattern-Konfiguration (V5.2+)

## Akzeptanzkriterien (Skizze)
- PII-Redaction-Pass erkennt mind. 90% synthetischer PII-Beispiele in Test-Suite
- Schritt-Extraktion liefert plausible Schritt-Liste (manuelle Bewertung an mind. 5 Test-Walkthroughs)
- Beide Worker-Jobs idempotent (Re-Run produziert gleiche Outputs +/- LLM-Variabilitaet)
- Audit-Log enthaelt Bedrock-Region, Modell-ID, Token-Count, Timestamp pro Pipeline-Run
- Bedrock-Region eu-central-1 (DSGVO)

## Abhaengigkeiten
- FEAT-034..036 (V5 deployed)
- Bedrock-Adapter aus V2 FEAT-005 / FEAT-010 (deployed)
- SOP-Pattern aus V2 FEAT-012 (deployed)

## Verweise
- PRD V5.1-Sektion (SC-V5.1-1, SC-V5.1-2, R-V5.1-1, R-V5.1-2)
- /requirements V5 RPT-XXX (2026-05-05)
- DEC offen — Q-V5.1-A (Sonnet vs. Haiku), Q-V5.1-B (Pattern-Granularitaet), Q-V5.1-C (Storage-Strategie Original vs. Redacted)
