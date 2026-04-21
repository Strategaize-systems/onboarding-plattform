# SLC-031 — Dialogue Extraction

## Goal
dialogue_extraction Worker-Job: Transkript + Meeting Guide → Knowledge Units (source='dialogue') + Meeting-Summary + Gap Detection. Das Kernstück der V3-KI-Pipeline.

## Feature
FEAT-020

## In Scope
- Neuer Worker-Job-Type: dialogue_extraction
- Prompt-Builder (System + User Prompt fuer Bedrock)
- KU-Import mit source='dialogue' (bestehender rpc_bulk_import_knowledge_units)
- Block-Zuordnung via meeting_guide.topics[].block_key
- Meeting-Summary JSONB generieren und speichern
- Gap Detection (nicht besprochene Themen)
- Kosten-Logging (ai_cost_ledger feature='dialogue_extraction')
- Status-Update: processing → processed

## Out of Scope
- Transkription (SLC-030)
- Debrief-UI (SLC-032)
- Cross-Meeting-Verdichtung (V3.1)

## Acceptance Criteria
- AC-1: Transkript wird gegen Meeting Guide verarbeitet
- AC-2: Knowledge Units mit source='dialogue' entstehen pro Thema
- AC-3: KUs sind den richtigen Template-Bloecken zugeordnet (via block_key)
- AC-4: Meeting-Summary als strukturiertes JSONB gespeichert
- AC-5: Nicht besprochene Themen als Gaps erkannt
- AC-6: Kosten geloggt
- AC-7: Status wechselt zu 'processed'

## Dependencies
- SLC-030 (Transkript muss vorhanden sein)
- SLC-026 (Meeting Guide Tabelle)

## Worktree
Empfohlen (SaaS, KI-Pipeline)

### Micro-Tasks

#### MT-1: Prompt-Builder
- Goal: System + User Prompt fuer Dialogue-Extraction
- Files: `src/workers/dialogue/dialogue-extraction-prompt.ts`
- Expected behavior: System-Prompt definiert Rolle ("Du analysierst ein Meeting-Transkript"). User-Prompt enthaelt: Transkript + Meeting-Guide Topics mit Leitfragen + block_keys. Output-Instruktion: Pro Topic → KUs + Coverage-Assessment. JSON-Output-Format definiert.
- Verification: Prompt-Output manuell pruefen (Laenge, Struktur, Vollstaendigkeit)
- Dependencies: none

#### MT-2: Extraction Handler
- Goal: dialogue_extraction Job-Handler
- Files: `src/workers/dialogue/handle-extraction-job.ts`
- Expected behavior: Laedt dialogue_session (transcript) + meeting_guide (topics). Baut Prompt. Bedrock-Call (Claude Sonnet, temp 0.3, maxTokens 16384). Parst JSON-Output. Speichert KUs via rpc_bulk_import. Speichert Summary + Gaps auf dialogue_session. Loggt Kosten. Status → 'processed'.
- Verification: Test-Transkript → KUs + Summary + Gaps in DB
- Dependencies: MT-1

#### MT-3: KU-Import mit source='dialogue' + Block-Zuordnung
- Goal: Extrahierte KUs dem richtigen Template-Block zuordnen
- Files: `src/workers/dialogue/handle-extraction-job.ts` (KU-Mapping-Logik)
- Expected behavior: Fuer jede KU: block_key aus dem zugehoerigen Meeting-Guide-Topic. Falls Topic keinen block_key hat: generischer Block "unzugeordnet". rpc_bulk_import_knowledge_units mit source='dialogue'.
- Verification: KUs in DB haben korrekte block_keys
- Dependencies: MT-2

#### MT-4: Claim-Loop-Registration + Tests
- Goal: dialogue_extraction im Worker registrieren, Tests
- Files: `src/workers/run.ts` (erweitern), `src/workers/dialogue/__tests__/extraction.test.ts`
- Expected behavior: Worker pollt dialogue_extraction Jobs. Test mit Mock-Transkript verifiziert Prompt-Aufbau + Output-Parsing.
- Verification: `npm run test` gruen
- Dependencies: MT-2
