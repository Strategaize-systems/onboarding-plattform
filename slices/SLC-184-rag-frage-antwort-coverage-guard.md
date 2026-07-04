# SLC-184 — RAG-Frage-Antwort + Coverage-Guard + Sprach-Eingabe

- Feature: FEAT-101 · Backlog: BL-527 · Version: V10.2
- Parallel-Group: 3 (nach SLC-182; teilt Shell-Komponenten mit SLC-183 → sequenziell nach B) · MIG: keine · Repo: OP (Full-Stack)
- Status: planned · Dependency: **SLC-182** (Shell); empfohlen nach **SLC-183** (gemeinsame QuestionBox/AnswerPanel/page.tsx)
- Quelle: /architecture V10.2 DEC-258 + DEC-259 + DEC-261 (RPT-563)

## Ziel
Die RAG-Frage-Antwort-Kette: freie Frage (Text ODER Sprache) gegen einen **gewählten Mandanten** → Titan-Embedding → `rpc_search_knowledge_chunks` → Sonnet-Antwort mit Quellen. Mit **Coverage-Guard** (DEC-261/ISSUE-112), damit fehlende Indexierung ehrlich statt halluziniert beantwortet wird. 0 Migrationen.

## Scope
- IN: admin-gated Transcribe-Route (Whisper-Reuse), RAG-Server-Action (Embedding + Search + Sonnet-Antwort + Coverage-Guard), Frage-Box-UI (Text + MediaRecorder-Sprache) + Antwort-Panel mit Quellen + Coverage-Hinweis + optionalem Re-Embed-Trigger, Mandanten-Selector.
- OUT: Cross-Tenant-Semantik-Suche (parked, DEC-258), neuer Embedding-Pipeline-Bau (ISSUE-112 = eigener Folge-Slice), ai_cost_ledger (DEC-259).

## Abnahme (AC)
- AC-184-1: Frage (Text) gegen gewählten Mandanten → belegte Antwort (Sonnet über Top-Chunks) mit Quellenliste (Typ/Titel/Datum/Snippet).
- AC-184-2: **Fail-closed** — kein gewählter Mandant → keine Suche; `tenant_id` server-seitig nach strategaize_admin-Gate gebunden, nie ungeprüft aus Client (DEC-258).
- AC-184-3: **Coverage-Guard** (DEC-261) — vor der Antwort: `count(knowledge_unit)` vs `count(knowledge_chunks WHERE source_type='knowledge_unit')` für den Mandanten; bei Lücke ehrlicher Hinweis („keine/teilweise indexierte Erkenntnisse") + optionaler Re-Embed-Trigger (Reuse `embedKnowledgeUnits`), NIE erfundene Antwort.
- AC-184-4: Sprach-Eingabe — MediaRecorder-Blob → `/api/admin/transcribe` (strategaize_admin-gated, Whisper-Reuse `getWhisperProvider`, in-memory, DSGVO) → Text in Frage-Box (Pattern-Reuse `questionnaire-form.tsx transcribeRecording`).
- AC-184-5: LLM-/Embedding-Calls error_log-audited, fail-open (Fehler → nutzbare Fehlermeldung, kein Crash); kein `ai_cost_ledger` (DEC-259).
- AC-184-6: Hermetische Tests (Happy / kein-Tenant-fail-closed / Coverage-Lücke / LLM-Fail); `tsc` 0, `eslint` 0, `next build` PASS; Browser-Smoke (Text + Sprache + Coverage-Hinweis, 0 Console-Errors).

## Micro-Tasks

#### MT-1: Admin-Transcribe-Route (Whisper-Reuse)
- Goal: dünne strategaize_admin-gated Transcribe-Route (tenant-agnostisch, da Admin cross-Mandant).
- Files: `src/app/api/admin/transcribe/route.ts`
- Expected: Gate → Multipart-Audio → `getWhisperProvider().transcribe(buffer)` → `{text}`; in-memory, keine Persistenz.
- Verification: Route-Test (auth 403 ohne Admin) + Live-Smoke (Audio → Text).
- Dependencies: SLC-182

#### MT-2: RAG-Server-Action + Coverage-Guard
- Goal: `askRag(tenantId, question)` → Embedding → Search → Coverage-Guard → Sonnet-Antwort mit Quellen.
- Files: `src/lib/workspace/rag.ts` (+ Test), `src/app/admin/mein-tag/rag-action.ts`
- Expected: Gate-Re-Check → `getEmbeddingProvider().embed(question)` → `rpc_search_knowledge_chunks(embedding, tenantId, limit)` → Coverage-Check → Sonnet-Prompt (Kontext+Zitier-Instruktion) → `{answer, sources[], coverageWarning?}`; fail-open + fail-closed (kein Tenant).
- Verification: hermetische Tests (Happy / kein-Tenant / Coverage-Lücke / LLM-Fail).
- Dependencies: SLC-182

#### MT-3: Frage-Box-UI (Text+Sprache) + Antwort-Panel + Mandanten-Selector
- Goal: QuestionBox (Text + Sprach-Button → admin-transcribe), AnswerPanel (Antwort + Quellen + Coverage-Hinweis + Re-Embed-Button), Mandanten-Selector.
- Files: `src/components/workspace/QuestionBox.tsx` (erweitern), `src/components/workspace/AnswerPanel.tsx` (erweitern), `src/components/workspace/TenantSelector.tsx`
- Expected: Frage stellen (getippt/gesprochen), Antwort + Quellen + ggf. Coverage-Warnung mit Re-Embed-Option.
- Verification: Browser-Smoke (Text + Sprache + Coverage-Hinweis).
- Dependencies: MT-1, MT-2

## Risiken / Dependencies
- R-184-1 (KRITISCH, ISSUE-112): fire-and-forget `embedKnowledgeUnits` → `knowledge_chunks` evtl. leer → Coverage-Guard (AC-184-3) ist Pflicht, nicht optional.
- R-184-2: Whisper nur lokal (`http://whisper:9000`), kein Azure-Fallback live — Transcribe-Fehler fail-open (Text-Eingabe bleibt möglich).
- R-184-3: Shared-Komponenten QuestionBox/AnswerPanel/page.tsx auch von SLC-183 berührt → nach SLC-183 mergen (Pre-Merge-Re-Check Pattern-Drift).
- R-184-4: `createAdminClient`/service-role nur nach Gate; `tenant_id` server-derived (DEC-258).
