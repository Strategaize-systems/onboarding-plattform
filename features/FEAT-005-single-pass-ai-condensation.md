# FEAT-005 — Single-Pass AI Condensation

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Herzstueck der V1. Nach jedem Block-Submit laeuft ein Worker, der die Antworten des Blocks (Questionnaire-Antworten + Exception-Text + KI-Chat-Verlauf) zu einer strukturierten Knowledge-Unit-Liste verdichtet. Das ist die portierte OS-Ebene-1, umgebaut auf neues Schema und auf AWS Bedrock.

## Why it matters
Ohne Verdichtung bleibt die Plattform ein Fragebogen-Tool. Die Verdichtung ist der Punkt, an dem sich das KI-first-Versprechen einloest: Berater-Zeit wird erst wertvoll, wenn ein verdichteter Stand zum Review bereitliegt.

## In Scope
- Portierung der OS-Ebene-1-Komponenten (siehe DEC-005, Discovery Abschnitt 13):
  - Migrations 033 / 049 / 050 aus OS (Schema-Basis fuer capture_session + knowledge_unit)
  - Query-Layer (`blueprint-workspace-queries.ts`, `ai-blueprint-draft-queries.ts`, `skills-import-queries.ts`) generalisiert
  - Worker `blueprint-block-draft-worker.ts` auf Bedrock umgebaut (Ollama-Client wird NICHT portiert)
  - Import-Endpoint `POST /api/blueprint/sessions/[sessionId]/import-debrief` generalisiert
- Prompt-Templates fuer Claude Sonnet, optimiert auf Knowledge-Unit-Struktur
- Confidence-Indikator pro Knowledge Unit (Skala-Entscheidung offen, Q4 in PRD)
- Worker-Trigger nach Block-Submit (Mechanismus offen, Q3 in PRD — Cron vs. Event)
- Bedrock-Call-Logging mit Token-Verbrauch pro Call
- Fehler-Handling: Worker-Failure setzt Block-Status auf "verdichtung-fehlgeschlagen", strategaize_admin bekommt Sichtbarkeit

## Out of Scope
- 3-Agenten-Loop Analyst + Challenger + Orchestrator (V2)
- Iterative Luecken-Erkennung mit Rueckspielung ins Questionnaire (V2)
- Retry-Mechanismus bei Transient-Fails (in V1 manueller Retry durch strategaize_admin, kein Auto-Retry)
- Cross-Block-Verdichtung (V1 verdichtet pro Block, nicht block-uebergreifend)

## Success Criteria
- Nach Block-Submit entstehen innerhalb von < 5 Minuten Knowledge Units im Debrief-UI
- Pro Knowledge Unit ist sichtbar: Text, Quelle (welche Fragen/Exception), Confidence-Indikator
- Worker-Fehler sind im UI sichtbar, blockieren aber nicht andere Bloecke
- Bedrock-Kosten pro Block-Submit sind protokolliert und manuell aggregierbar
- OS-Code ist auf Bedrock umgestellt, Ollama-Client existiert nicht im Repo

## Related
- DEC-005 (OS-Portierung), DEC-006 (Bedrock)
- FEAT-001 (Datenmodell), FEAT-003 (Questionnaire-Submit-Trigger), FEAT-004 (Exception als Input), FEAT-006 (Debrief-Output)
- SC-2 (Ende-zu-Ende Berater), SC-8 (Bedrock-Kosten), R1 (KI-Qualitaet), R4 (Bedrock-Kosten)
