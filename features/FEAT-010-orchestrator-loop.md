# FEAT-010 — 3-Agent Orchestrator Loop

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Erweitert den bestehenden 2-Agent-Loop (Analyst+Challenger, FEAT-005) um einen Orchestrator als dritten Agenten. Der Orchestrator steuert den Loop intelligent, bewertet die Gesamtqualitaet der Knowledge Units und erkennt systematische Wissensluecken.

## Why it matters
V1 nutzt einfache Konvergenz-Kriterien (Challenger-Verdict + max Iterationen). Das reicht fuer grundlegende Verdichtung, erkennt aber keine systematischen Luecken im Kundenwissen und kann nicht differenziert entscheiden, ob ein Block "gut genug" ist oder gezielte Nacharbeit braucht. Der Orchestrator hebt die Verdichtungsqualitaet auf ein neues Level und ist die Basis fuer Auto-Gap-Backspelling (FEAT-011).

## How the Orchestrator works

### Bestehender Loop (V1, unveraendert)
- Analyst erzeugt Knowledge Units aus Block-Daten
- Challenger prueft KUs nach 10-Punkt-Checkliste
- 2-8 Iterationen bis Konvergenz

### Neuer Orchestrator-Layer (V2)
1. **Pre-Assessment:** Vor dem A+C-Loop bewertet der Orchestrator die Eingabedaten (Antwort-Vollstaendigkeit, Antwort-Tiefe pro Frage).
2. **Loop-Steuerung:** Der Orchestrator entscheidet nach jeder A+C-Iteration, ob weitere Iterationen noetig sind. Kriterien:
   - Inhaltliche Qualitaet der KUs (nicht nur Challenger-Verdict)
   - Coverage: Sind alle Subtopics abgedeckt?
   - Evidence-Qualitaet: Basieren KUs auf konkreten Kundenaussagen?
   - Konsistenz: Widersprechen sich KUs innerhalb des Blocks?
3. **Gap-Detection:** Nach Abschluss des Loops identifiziert der Orchestrator konkrete Wissensluecken:
   - Fragen die unbeantwortet oder oberflaechlich beantwortet wurden
   - Subtopics ohne ausreichende Evidenz
   - Widersprueche die nur durch Kundenrueckfrage klaerbar sind
4. **Quality Report:** Pro Block erzeugt der Orchestrator einen strukturierten Qualitaets-Report:
   - Gesamt-Score (enum: insufficient / acceptable / good / excellent)
   - Luecken-Liste (strukturiert fuer Backspelling, FEAT-011)
   - Empfehlung: "Backspelling noetig" vs. "Block ist vollstaendig"

### Orchestrator als separater Bedrock-Call
Der Orchestrator ist ein eigener Bedrock-Prompt — kein Code-only-Layer. Er nutzt Claude Sonnet mit eigenem System-Prompt fuer Meta-Bewertung. Das ermoeglicht:
- Nuancierte Qualitaets-Urteile die ueber regelbasierte Checks hinausgehen
- Natuerlichsprachliche Luecken-Formulierung fuer Backspelling
- Spaetere Prompt-Optimierung ohne Code-Aenderung

## In Scope
- Orchestrator-Prompt fuer Pre-Assessment, Loop-Steuerung, Gap-Detection
- Orchestrator-Ergebnis als neue Spalte/Tabelle in der DB (quality_report JSONB auf block_checkpoint oder eigene Tabelle)
- Iterations-Log erweitert um Orchestrator-Entscheidungen
- Kosten-Logging pro Orchestrator-Call
- Konfigurierbare Qualitaets-Schwellenwerte via ENV

## Out of Scope
- UI fuer Orchestrator-Report (V2.1, Debrief-UI zeigt Report spaeter)
- Cross-Block-Orchestration (V3, erfordert block-uebergreifenden Kontext)
- Prompt-Admin-UI (V2.1+)

## Success Criteria
- Orchestrator entscheidet Break-Kriterien basierend auf inhaltlicher Qualitaet
- Gap-Detection identifiziert mindestens 80% der offensichtlichen Wissensluecken
- Orchestrator-Entscheidungen sind im Iterations-Log nachvollziehbar
- Gesamt-Qualitaets-Score ist pro Block sichtbar
- Kosten pro Orchestrator-Call sind protokolliert

## Cost Estimate
- 1-2 Orchestrator-Calls pro Block (Pre-Assessment + Post-Loop-Assessment)
- Plus 0-1 Calls pro Iteration (Loop-Steuerung)
- Geschaetzt: $0.05-$0.15 zusaetzlich pro Block
- Gesamt pro Session (9 Blocks): $0.45-$1.35 zusaetzlich

## Dependencies
- FEAT-005 (bestehender A+C-Loop als Basis)
- FEAT-011 nutzt Gap-Detection-Output
- FEAT-012 nutzt Quality-Report

## Related
- DEC-014 (Multi-Agent-Loop), DEC-006 (Bedrock), DEC-007 (Worker-Container)
- FEAT-005 (A+C-Loop), FEAT-011 (Backspelling), FEAT-012 (SOP)
