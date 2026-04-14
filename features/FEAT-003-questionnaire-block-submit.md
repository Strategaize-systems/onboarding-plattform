# FEAT-003 — Questionnaire Mode with Block-Submit

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Der Haupt-Interaktionsmodus fuer Kunden in V1. Kunde arbeitet einen Block durch, wird dabei vom KI-Chat unterstuetzt, und triggert per Block-Submit einen versionierten Checkpoint — das Signal, dass der Block bereit fuer KI-Verdichtung ist.

## Why it matters
Das Block-Submit-Pattern ist der zentrale Uebergabe-Punkt zwischen Mensch (Kunde) und KI (Verdichtung). Ohne dieses Pattern gibt es keinen definierten "fertig"-Zustand pro Block und keine saubere Versionierung.

## In Scope
- Portierung des Questionnaire-Moduls aus Blueprint V3.4 auf neues Schema (capture_session + knowledge_unit)
- Block-Navigation: Kunde sieht alle Bloecke, kann in beliebiger Reihenfolge bearbeiten
- KI-Chat als Hilfe waehrend der Block-Bearbeitung (bestehend aus Blueprint, auf Bedrock umgestellt)
- Block-Submit-API mit Erzeugung eines versionierten Checkpoints in `block_checkpoint`
- Status-Anzeige pro Block: offen / in Arbeit / submitted / in Review / finalized
- Autosave pro Antwort (aus Blueprint uebernommen)

## Out of Scope
- Parallele Bearbeitung eines Blocks durch mehrere User in Echtzeit (V2+)
- Automatische Rueckgabe des Blocks an den Kunden nach KI-Luecken-Erkennung (V2)
- Offline-Mode / PWA (V5)
- Voice-Input (spaeter, abhaengig von Whisper-Infrastruktur)

## Success Criteria
- tenant_admin kann mindestens einen Block end-to-end bearbeiten und submitten
- Block-Submit erzeugt Checkpoint mit Timestamp und Versions-Hash
- Block-Status aendert sich sichtbar im UI nach Submit
- Der KI-Chat laeuft ueber AWS Bedrock, nicht ueber Ollama oder andere Provider
- Autosave funktioniert ohne Datenverlust nach Reload

## Related
- DEC-001 (Blueprint-Basis), DEC-004 (KI-first), DEC-006 (Bedrock)
- FEAT-001 (Datenmodell), FEAT-002 (Template-Content)
- SC-1 (Ende-zu-Ende Kunde), SC-6 (Versionierung), SC-7 (KI-first Rolle)
