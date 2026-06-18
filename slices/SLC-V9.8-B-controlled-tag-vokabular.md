# SLC-V9.8-B — Controlled Tenant-Tag-Vokabular (Prompt-Injektion)

- Version: V9.8
- Feature: FEAT-088
- Backlog: BL-505
- Status: planned
- Priority: High
- Created: 2026-06-18
- Parallel-Group: S2 (nach SLC-V9.8-A — Vokabular-Quelle ist `knowledge_unit.themes` aus Mig 123)
- MIG reserviert: **keine** (0 Migration, 0 neue Deps/Jobs/Worker)
- Worktree (SaaS-Pflicht): selber Cumulative-Single-Branch `v9-8-tag-vokabular` (nach A)

## Ziel
Ein pro-Tenant wachsendes, kontrolliertes Tag-Vokabular steuert das LLM aktiv bei der Theme-Vergabe: die bestehenden Tenant-Tags (Top-N nach Haeufigkeit aus `knowledge_unit.themes`) werden in den **Synthese-Prompt** injiziert mit der Regel „nutze einen passenden bestehenden Tag; entscheide nur ein neues Tag, wenn nichts passt". Verhindert Synonym-Wildwuchs (antwortzeit / reaktionszeit / antwort-geschwindigkeit) → Findbarkeit im Handbuch.

## Architektur-Anker
- DEC-229: Vokabular-Quelle = **on-the-fly-Aggregation aus `knowledge_unit.themes` pro Tenant** (keine `tenant_tag`-Tabelle). Die promotete/kuratierte Tag-Menge IST das Vokabular → selbstverstaerkende kontrollierte Schleife. → FEAT-088 haengt hart an FEAT-089 (SLC-A).
- DEC-230: Top-N nach Haeufigkeit, **Cap 60/Tenant** (Token-Budget R-B-1).
- DEC-231: Injektion **NUR im Synthese-Prompt** (V1). Extraktion deferred (50er-Batches teuer + intermediaere Themes; Synthese ist bounded 1 Call/Section, DEC-216, + propagations-bindend).
- Code-Anker: `buildSynthesisUserPrompt(sectionName, patterns)` (`email-synthesis-prompt.ts:74`) wird in `email-synthesis.ts:142` gerufen; `defaultSectionSynthesizer` (`handle-synthesis-job.ts:113`) ruft `email-synthesis.ts`; `run.tenant_id` in `handle-synthesis-job.ts` ab Z.270 verfuegbar; `getTenantTagVocabulary` existiert noch NICHT.

## Akzeptanzkriterien
- **AC-B-1:** Neuer Helper `getTenantTagVocabulary(adminClient, tenantId, cap = 60)` liefert die Top-N Tenant-Tags nach Haeufigkeit aus `knowledge_unit.themes`, strikt tenant-scoped. On-the-fly, keine neue Tabelle/kein neuer RPC.
- **AC-B-2:** `buildSynthesisUserPrompt` um optionalen `existingTags`-Block + use-existing-where-fits/only-add-if-novel-Regel erweitert. Leeres Vokabular → Prompt unveraendert (graceful, 0 Regression).
- **AC-B-3:** `handle-synthesis-job.ts` holt das Vokabular nach run-Load (`run.tenant_id`) und reicht es durch `SectionSynthesizer` → `email-synthesis.ts` → `buildSynthesisUserPrompt`.
- **AC-B-4:** Tenant-Isolation — Vokabular-Query strikt tenant-scoped, kein Cross-Tenant-Leak (DB-Sidecar/SAVEPOINT-Pen-Test, SC-4).
- **AC-B-5:** Lauf gegen Tenant mit Vokabular: der gerenderte Synthese-User-Prompt enthaelt den `existingTags`-Block + die Regel (deterministisch testbar). Dass das LLM real bestehende Tags statt Synonyme reproduziert (SC-2/SC-3) ist **Live-Smoke/observational**, nicht hermetisch deterministisch — Limitation explizit (R-B-3).
- **AC-B-6:** `tsc` 0, `eslint` 0, hermetische Vitest GREEN, `next build` PASS.

## Micro-Tasks

### MT-1: Vokabular-Loader `getTenantTagVocabulary`
- Goal: Top-60 Tenant-Tags nach Haeufigkeit aus `knowledge_unit.themes`.
- Files: `src/lib/bulk-email/tag-vocabulary.ts` (neu), `src/lib/bulk-email/__tests__/tag-vocabulary.test.ts` (neu).
- Expected behavior: `SELECT themes FROM knowledge_unit WHERE tenant_id = $1 AND array_length(themes,1) > 0` → in TS flatten + Frequenz zaehlen + desc sortieren + `slice(cap)`. Leeres Ergebnis → `[]`. (JS-seitige Aggregation, weil Architektur nur Mig 123 [Spalte+GIN], **keinen** Aggregations-RPC vorsieht; per-Tenant `knowledge_unit`-Rowcount ist bounded — siehe R-B-2.)
- Verification: hermetischer Unit-Test (Frequenz/Sort/Cap, leer→`[]`) + DB-Sidecar Tenant-Isolation-Test (Tenant B sieht Tenant-A-Tags nicht).
- Dependencies: SLC-V9.8-A (Spalte `knowledge_unit.themes` live).

### MT-2: Prompt-Injektion in `buildSynthesisUserPrompt`
- Goal: Vokabular + Regel in den Synthese-User-Prompt.
- Files: `src/lib/ai/bedrock-sonnet/email-synthesis-prompt.ts`, `src/lib/ai/bedrock-sonnet/__tests__/email-synthesis-prompt.test.ts` (neu falls fehlt).
- Expected behavior: Signatur `buildSynthesisUserPrompt(sectionName, patterns, existingTags: string[] = [])`. Bei nicht-leerem `existingTags`: kompakter `existingTags`-Block (JSON-Liste) + Regel-Text „Nutze fuer `themes` zuerst einen passenden Tag aus dieser Liste; entscheide nur ein NEUES Tag, wenn keiner inhaltlich passt." Leer → Block weggelassen (Prompt byte-identisch zu heute).
- Verification: Test: Prompt enthaelt Block+Regel bei Tags vorhanden; identisch zu Baseline bei `[]`.
- Dependencies: MT-1 (Form der Tag-Liste).

### MT-3: Wiring durch Synthesizer + Worker + Test-Mocks
- Goal: Vokabular fliesst vom Worker bis in den Prompt.
- Files: `src/lib/ai/bedrock-sonnet/email-synthesis.ts` (synthesize-section reicht `existingTags` an `buildSynthesisUserPrompt`), `src/workers/bulk-email/handle-synthesis-job.ts` (`SectionSynthesizer`-Signatur um `existingTags` erweitern; Vokabular nach run-Load via `getTenantTagVocabulary(adminClient, run.tenant_id, 60)` holen; in jede `synthesizer(section, patterns, vocab)`-Schleife durchreichen), `src/workers/bulk-email/__tests__/handle-synthesis-job.test.ts` (Mock-Synthesizer-Signatur + Assertion „Vokabular durchgereicht").
- Expected behavior: ein Synthese-Lauf eines Tenants mit Bestand-Themes erzeugt Prompts mit dem Tenant-Vokabular-Block; `defaultSectionSynthesizer` bleibt der Default.
- Verification: hermetische Vitest GREEN (Worker-Suite + Synthese-Suite); `tsc`/`eslint` 0; `next build` PASS.
- Dependencies: MT-1 + MT-2.

## Risiken & Dependencies
- **R-B-1 (Token-Budget):** Cap 60 (DEC-230). Tenant mit >60 distinkten Tags → Top-60 nach Haeufigkeit. Akzeptiert.
- **R-B-2 (Aggregations-Ort):** JS-seitig statt SQL-`unnest+count` (kein Aggregations-RPC laut Architektur; Mig 123 = nur Spalte+GIN). Per-Tenant-`knowledge_unit`-Rowcount ist bounded → voller `themes`-Select billig. Falls je gross: RPC/Materialisierung = V9.8+-Kandidat („nicht ueberdesignen").
- **R-B-3 (Behavioral, non-deterministisch):** Ob das LLM real bestehende Tags reused, ist nicht hermetisch beweisbar. Hermetik prueft Prompt-Inhalt (Block+Regel da); SC-2/SC-3 = Live-Smoke/observational. Im /qa als Confidence-Limit ausweisen.
- **R-B-4 (Embedding deferred):** synonyme Normalisierung via Titan/pgvector ist NICHT in V9.8 (DEC-232). Prompt-Kontrolle ist die einzige Bremse in V1.
- **Hard-Dependency:** SLC-V9.8-A muss live sein (Vokabular-Quelle `knowledge_unit.themes`). **Strikt sequentiell — nicht parallel zu A.**

## Out of Scope
Injektion in den Extraktions-Prompt (deferred, DEC-231); Embedding-Normalisierung (DEC-232); manuelle Tag-Verwaltungs-UI (umbenennen/mergen/loeschen); retroaktives Re-Tagging.
