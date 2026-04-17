# FEAT-005 — Multi-Agent AI Condensation (Analyst+Challenger Loop)

- Status: planned
- Version: V1
- Created: 2026-04-14
- Updated: 2026-04-17 (DEC-014: Single-Pass → Multi-Agent-Loop)

## Purpose
Herzstueck der V1. Nach jedem Block-Submit laeuft ein Worker, der die Antworten des Blocks (Questionnaire-Antworten + Exception-Text + KI-Chat-Verlauf) iterativ zu einer strukturierten Knowledge-Unit-Liste verdichtet. Der Worker implementiert den Analyst+Challenger Loop aus dem Operating System, portiert auf AWS Bedrock.

## Why it matters
Ohne Verdichtung bleibt die Plattform ein Fragebogen-Tool. Die Verdichtung ist der Punkt, an dem sich das KI-first-Versprechen einloest: Berater-Zeit wird erst wertvoll, wenn ein verdichteter Stand zum Review bereitliegt. Single-Pass-Verdichtung wurde verworfen (DEC-014), weil unkontrollierte Einmal-Ergebnisse dem Qualitaetsanspruch widersprechen. Der iterative Loop liefert selbst-korrigierte, geprueft Ergebnisse.

## How the Loop works

### Analyst-Phase (pro Iteration)
- Laedt Block-Daten (Antworten, Exception, Chat-Kontext) + vorherige Challenger-Kritik (ab Iteration 2)
- Erstellt pro Subtopic genau 1 Knowledge Unit (Debrief Item)
- Pro KU: priority (P0-P3), confidence (low/medium/high), current_state, target_state, recommendation, next_step, evidence_refs
- Output: strukturiertes JSON mit allen KUs des Blocks

### Challenger-Phase (pro Iteration)
- Laedt Analyst-Output + Original-Rohdaten
- Prueft systematisch (10-Punkt-Checkliste):
  1. Vollstaendigkeit: Kein Subtopic darf fehlen
  2. Evidenz-Qualitaet: Referenzen muessen auf echte Antworten verweisen
  3. Current-State-Genauigkeit: Spiegelt Rohdaten wider?
  4. Target-State-Realismus: Erreichbar oder utopisch?
  5. Score-Konsistenz: Maturity vs. Risk vs. Leverage
  6. Priority/Traffic-Light-Alignment
  7. KO-Kriterien: Alle harten KO-Flags erkannt?
  8. Empfehlungs-Qualitaet: Spezifisch oder generisch?
  9. Cross-Block-Muster: Owner-Abhaengigkeiten
  10. Challenger-Response: Vorherige Kritik adressiert?
- Verdict: ACCEPTED | ACCEPTED_WITH_NOTES | NEEDS_REVISION | REJECTED

### Convergence
- Minimum 2 Iterationen (auch bei sofortigem ACCEPTED)
- Maximum 8 Iterationen
- Loop endet bei Verdict ACCEPTED oder ACCEPTED_WITH_NOTES
- Bei max_iterations erreicht: Warnung, bestes Ergebnis wird verwendet

## In Scope
- Portierung der OS-Skills (blueprint-analyze, blueprint-challenge, blueprint-loop) als Worker-Code
- Analyst-Prompt + Challenger-Prompt fuer Claude Sonnet via Bedrock
- Iterative Convergence-Logik im Worker
- Prompt-Templates optimiert auf Knowledge-Unit-Struktur
- Confidence-Indikator pro Knowledge Unit (low / medium / high, DEC-008)
- Worker-Trigger nach Block-Submit via ai_jobs-Queue (SLC-006)
- Bedrock-Call-Logging mit Token-Verbrauch pro Call und Iteration
- Iterations-Log pro Job (welche Korrekturen in welcher Runde)
- Fehler-Handling: Worker-Failure setzt Job auf "failed", strategaize_admin bekommt Sichtbarkeit

## Out of Scope
- Iterative Luecken-Erkennung mit Rueckspielung ins Questionnaire (V2)
- Retry-Mechanismus bei Transient-Fails (V1 manueller Retry durch strategaize_admin)
- Cross-Block-Verdichtung (V1 verdichtet pro Block, nicht block-uebergreifend)
- Prompt-Admin-UI (V2+, V1 nur ueber Migrationen)

## Success Criteria
- Nach Block-Submit entstehen innerhalb von < 5 Minuten Knowledge Units im Debrief-UI
- Mindestens 2 Iterationen (Analyst→Challenger) pro Block-Submit
- Pro Knowledge Unit ist sichtbar: Text, Quelle, Confidence-Indikator
- Challenger-Verdict ist im Iterations-Log nachvollziehbar
- Worker-Fehler sind im UI sichtbar, blockieren aber nicht andere Bloecke
- Bedrock-Kosten pro Block-Submit sind protokolliert und aggregierbar
- OS-Code ist auf Bedrock umgestellt, Ollama-Client existiert nicht im Repo

## Cost Estimate
- 2-8 Iterationen × 2 Bedrock-Calls (Analyst + Challenger) = 4-16 Calls pro Block
- Bei ~5K Tokens pro Call: $0.10-$0.40 pro Block
- Bei 9 Blocks pro Session: $0.90-$3.60 pro Session
- Fuer B2B-SaaS akzeptabel (DEC-014)

## Related
- DEC-005 (superseded), DEC-014 (Multi-Agent-Loop), DEC-006 (Bedrock), DEC-007 (Worker-Container)
- FEAT-001 (Datenmodell), FEAT-003 (Questionnaire-Submit-Trigger), FEAT-004 (Exception als Input), FEAT-006 (Debrief-Output)
- OS-Skills: blueprint-analyze, blueprint-challenge, blueprint-loop
