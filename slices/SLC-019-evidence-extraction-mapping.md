# SLC-019 — Evidence-Extraction + Mapping

## Zuordnung
- Feature: FEAT-013 (Evidence-Mode Backend)
- Version: V2
- Priority: High
- Depends on: SLC-018

## Ziel
Worker extrahiert Text aus hochgeladenen Dateien und mappt Inhalte per KI auf Template-Fragen. Neuer Job-Type evidence_extraction.

## Scope
- npm install pdf-parse mammoth (Worker-Dependencies)
- Worker: evidence_extraction Job-Type
- Text-Extraktion: PDF (pdf-parse), DOCX (mammoth), TXT/CSV (direct), ZIP (node:zlib + Rekursion)
- Chunking (~500-800 Tokens)
- KI-Mapping: Bedrock-Prompt mappt Chunks auf Template-Fragen
- evidence_chunk-Rows mit mapping_suggestions schreiben
- Migration 049: RPC fuer Evidence-Chunk-Schreibung und Mapping-Bestaetigung/Ablehnung
- ai_cost_ledger mit feature='evidence_mapping'

## Nicht in Scope
- Evidence-UI (SLC-020)
- OCR fuer Bild-PDFs (V2.1)
- E-Mail-Dump-Import (V2.1)

## Acceptance Criteria
1. PDF-Upload → Text extrahiert → Chunks erstellt → Mappings vorgeschlagen
2. DOCX-Upload → Text extrahiert → Chunks erstellt → Mappings vorgeschlagen
3. TXT-Upload → Chunks erstellt → Mappings vorgeschlagen
4. ZIP-Upload → Einzeldateien entpackt → je Datei Extraktion + Mapping
5. mapping_suggestion JSONB enthaelt: question_id, block_key, question_text, confidence, relevant_excerpt
6. Kosten in ai_cost_ledger mit feature='evidence_mapping'
7. Fehlerhafte Dateien: extraction_status='failed' + extraction_error gesetzt
8. npm run build erfolgreich

### Micro-Tasks

#### MT-1: Worker-Dependencies installieren
- Goal: pdf-parse + mammoth als Worker-Dependencies
- Files: `package.json` (oder separates Worker-package.json falls vorhanden)
- Expected behavior: npm install pdf-parse mammoth erfolgreich, Import funktioniert
- Verification: npm run build
- Dependencies: none

#### MT-2: Text-Extraction-Modul
- Goal: Unified Text-Extraktion fuer verschiedene Dateiformate
- Files: `src/workers/evidence/extract-text.ts`
- Expected behavior: extractText(buffer, mimeType) → string. Dispatcht nach MIME-Type auf pdf-parse, mammoth, oder Direkt-Lesen. ZIP: entpackt + extrahiert pro Datei. Fehler-Handling: wirft bei nicht-unterstuetztem Format oder korrupten Dateien.
- Verification: npm run build
- Dependencies: MT-1

#### MT-3: Chunking-Modul
- Goal: Text in Chunks aufteilen
- Files: `src/workers/evidence/chunk-text.ts`
- Expected behavior: chunkText(text, maxTokens=700) → string[]. Splittet an Absatz-Grenzen, faellt zurueck auf Satz-Grenzen, faellt zurueck auf Token-Grenzen. Kein Overlap bei Dokumenten (anders als bei Meeting-Transkripten).
- Verification: npm run build + Unit-Test
- Dependencies: none

#### MT-4: Evidence-Mapping-Prompt
- Goal: Bedrock-Prompt der Chunks auf Template-Fragen mappt
- Files: `src/workers/evidence/mapping-prompt.ts`, `src/workers/evidence/types.ts`
- Expected behavior: Input: chunk_text + Template-Fragen-Liste (aus template.blocks). Output: Array von {question_id, block_key, question_text, confidence, relevant_excerpt}. Prompt: "Welche der folgenden Fragen wird durch diesen Text-Abschnitt beantwortet?"
- Verification: TypeScript kompiliert
- Dependencies: none

#### MT-5: Migration 049_rpc_evidence.sql
- Goal: RPCs fuer Evidence-Chunk-Management
- Files: `sql/migrations/049_rpc_evidence.sql`
- Expected behavior: (1) rpc_create_evidence_chunks(file_id, chunks JSONB[]) — Bulk-INSERT evidence_chunk. (2) rpc_confirm_evidence_mapping(chunk_id, question_id, block_key) — UPDATE mapping_status='confirmed'. (3) rpc_reject_evidence_mapping(chunk_id) — UPDATE mapping_status='rejected'. (4) rpc_update_evidence_file_status(file_id, status, error) — UPDATE extraction_status + error.
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-6: Migration auf Hetzner ausfuehren
- Goal: RPCs auf Produktions-DB
- Files: keine Code-Aenderung
- Verification: `\df rpc_*evidence*`
- Dependencies: MT-5

#### MT-7: Worker — evidence_extraction Job-Type
- Goal: Kompletter Evidence-Processing-Flow im Worker
- Files: `src/workers/evidence/handle-evidence-job.ts`, `src/workers/condensation/claim-loop.ts`
- Expected behavior: (1) Registriere Job-Type 'evidence_extraction' in Claim-Loop. (2) Lade evidence_file Metadaten. (3) Download aus Supabase Storage. (4) extractText(). (5) chunkText(). (6) Pro Chunk: mapping-prompt → Bedrock-Call. (7) rpc_create_evidence_chunks(). (8) rpc_update_evidence_file_status('extracted'). (9) ai_cost_ledger mit feature='evidence_mapping'. (10) rpc_complete_ai_job. Fehler: rpc_update_evidence_file_status('failed', error.message).
- Verification: npm run build, Worker startet
- Dependencies: MT-2, MT-3, MT-4, MT-6

#### MT-8: Tests — Extraction + Chunking
- Goal: Unit-Tests fuer Text-Extraktion und Chunking
- Files: `src/workers/evidence/__tests__/extract-chunk.test.ts`
- Expected behavior: Testet: PDF-Text-Extraktion (mit Test-PDF-Buffer), DOCX-Extraktion, Chunking-Grenzen, Fehler bei korrupter Datei
- Verification: npm run test -- extract-chunk
- Dependencies: MT-2, MT-3
