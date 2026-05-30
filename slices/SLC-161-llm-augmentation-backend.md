# SLC-161 — V8.1 LLM-Augmentation Backend (FEAT-069)

**Version:** V8.1
**Feature:** FEAT-069 (LLM-Augmentation der 3 Empfehlungs-Texte)
**Backlog:** BL-143
**Status:** planned
**Created:** 2026-05-30
**Priority:** High
**Estimate:** ~2-3h Code-Side + Vitest gegen Coolify-DB
**Worktree Branch:** `v8-1-lead-conversion` (NEU — Cumulative-Single-Branch fuer SLC-161 + SLC-162 + SLC-163, analog V8.0-Pattern, SaaS-Mode-Pflicht)

## Slice Goal

Liefert die **LLM-Augmentation-Schicht** fuer die 3 Empfehlungs-Texte im V8.1-Outro:

1. **Bedrock-Adapter-Reuse** mit Sonnet 3.5 in eu-central-1 (data-residency.md Pflicht, DEC-175)
2. **`augmentEmpfehlungsText` Pure-Function** mit System-Prompt + Tonality-Post-Validation + Fallback-Logik (DEC-167)
3. **Caching via `capture_session.metadata.v8_1_llm_augmentation_cache`** (JSONB-Slot, Reuse V8.0-DEC-165-Schema)
4. **Tuple-Cache-Key** `{capture_session_id + model_id + prompt_version}` (DEC-167)
5. **Deterministischer Fallback** bei LLM-Fail (Timeout, Cost-Cap, Tonality-Drift, Bedrock-Error) — graceful-degrade auf V8.0-Stufen-Lookup-Texte
6. **Audit-Trail** via `ai_cost_ledger` (existierende Tabelle, V6+) pro Call mit Cost/Tokens/Latency/Success-Flag
7. **Vitest gegen Coolify-DB** — Cache-Hit/Miss + Modell-ID-Drift-Invalidation + Tonality-Drift-Fallback + Word-Count-Cap

Output: Pure-Function-Library, fertig zum Aufruf aus SLC-162 Outro-Renderer.

## In Scope

- **`src/lib/llm/v8-1-augmentation/prompt.ts`** — System-Prompt + `V8_1_PROMPT_VERSION` Konstante (Default `"v1"`) + Tonality-Vorgabe + Blacklist-Patterns
- **`src/lib/llm/v8-1-augmentation/cache.ts`** — Read/Write `capture_session.metadata.v8_1_llm_augmentation_cache` JSONB-Slot, Tuple-Key-Match-Logik
- **`src/lib/llm/v8-1-augmentation/augment.ts`** — `augmentEmpfehlungsText(input)` Pure-Function: Cache-Check → Bedrock-Call → Tonality-Post-Validation → Word-Count-Check → Cache-Write ODER Fallback
- **`src/lib/llm/v8-1-augmentation/types.ts`** — `AugmentInput` + `AugmentOutput` + `CacheEntry` TypeScript-Interfaces
- **`src/lib/llm/v8-1-augmentation/index.ts`** — Re-Export Public-API
- **`src/lib/llm/v8-1-augmentation/__tests__/augment.test.ts`** — Vitest gegen Coolify-DB (Cache-Hit/Miss + Fallback-Pfade + Tonality-Validation)
- **`src/lib/llm/v8-1-augmentation/__tests__/prompt.test.ts`** — Vitest fuer Pure-Logic (Prompt-Validation, Blacklist)
- **`src/lib/llm/v8-1-augmentation/__tests__/cache.test.ts`** — Vitest fuer Cache-Tuple-Logic
- **ENV-Variable `BEDROCK_V8_1_MODEL_ID`** in `.env.deploy.example` (Default `anthropic.claude-3-5-sonnet-20241022-v2:0`, DEC-175)
- **ai_cost_ledger-Integration**: pro Bedrock-Call ein Entry mit `capture_session_id`, `modul_name`, `model_id`, `token_count_input`, `token_count_output`, `cost_usd`, `latency_ms`, `success_flag`
- **error_log-Integration**: Audit-Entry mit category `v8_1_llm_call` bei Fail + category `v8_1_llm_cache_hit` bei Cache-Hit (Zero-Cost)
- **Tonality-Post-Validation**: Blacklist `\bich\b|mein Team|der Founder|Founders|wir empfehlen Ihnen|Euro|EUR|Kosten|Preis` (case-insensitive Word-Boundary fuer "ich")
- **Word-Count-Cap**: max 80 Worte pro generiertem Text

## Out of Scope

- **Outro-Renderer-Integration** (FEAT-067 Aufruf der `augmentEmpfehlungsText`) — SLC-162
- **CTA-Mechanik + Magic-Link** (FEAT-068) — SLC-163
- **Async-Worker-Pattern** (DEC-174 sync-only in V8.1) — V8.2+
- **Multi-Sprach-Variante** (NL/EN) — V8.2+
- **LLM-Augmentation der Strategaize-Vorstellungs-Absaetze** (statisch, redaktionell) — siehe FEAT-067 Out of Scope
- **LLM-Augmentation der V8.0-Modul-Pages** (DEC-159..161 deterministisch) — explizit nie in V8.1
- **A/B-Modell-Vergleich** (Sonnet vs Opus vs Haiku) — V8.2+
- **Tonality-Audit-Skript-Erweiterung** — gehoert in SLC-162 MT-6 (Renderer-Integration-Scope)
- **Cache-Invalidation via Admin-UI** — V8.2+ (V8.1 nutzt automatische Tuple-Key-Invalidation)

## Pre-Conditions

- ✓ V8.0 RELEASED (REL-026), main HEAD `875e47d`
- ✓ Bedrock-Adapter existiert (`src/lib/llm/bedrock-client.ts` oder analog), V6.3-tested
- ✓ ai_cost_ledger Tabelle existiert (V6 + V6.3-Hotfix-Migration 095)
- ✓ error_log Tabelle existiert (V1.1)
- ✓ capture_session.metadata JSONB-Spalte existiert (V8.0 DEC-165, Migration 103)
- ✓ DEC-167 Tuple-Cache-Key entschieden
- ✓ DEC-174 Synchron-Render entschieden
- ✓ DEC-175 ENV BEDROCK_V8_1_MODEL_ID entschieden
- ⏳ **Worktree-Setup `v8-1-lead-conversion`** = MT-0 (Pre-Slice)

## Micro-Tasks

### MT-0: Worktree-Setup + Branch
- **Goal**: Cumulative-Single-Branch-Worktree `v8-1-lead-conversion` aus main anlegen (analog V8.0 `v8-mandanten-report`-Pattern). Junction-Setup. `npm install`.
- **Files**: nichts im Repo, Setup-Commands.
- **Expected behavior**: `git worktree add -b v8-1-lead-conversion c:/strategaize/strategaize-onboarding-plattform-v8-1 main` + `npm install` im neuen Worktree.
- **Verification**: `git worktree list` zeigt 2 Worktrees, `git status` im neuen Worktree clean, `node_modules/` existiert.
- **Dependencies**: none

### MT-1: System-Prompt + Konstanten
- **Goal**: `prompt.ts` mit System-Prompt + `V8_1_PROMPT_VERSION = "v1"` + Tonality-Blacklist-Patterns + Max-Word-Count-Konstante 80.
- **Files**:
  - `src/lib/llm/v8-1-augmentation/prompt.ts` (NEU)
  - `src/lib/llm/v8-1-augmentation/__tests__/prompt.test.ts` (NEU)
- **Expected behavior**: System-Prompt enthaelt explizite Strategaize-Wir-Voice-Vorgabe, 2-3 Saetze, max 80 Worte, verkaufsorientiert ohne Pricing. `V8_1_PROMPT_VERSION` als versionierte Konstante fuer Cache-Invalidation. Blacklist-Patterns als RegExp-Array exportiert.
- **Verification**: Vitest prueft (a) System-Prompt enthaelt 'Strategaize-Wir-Voice', 'max 80 Worte', 'keine Pricing-Hinweise'; (b) `V8_1_PROMPT_VERSION` ist String; (c) Blacklist-Patterns matchen `"ich glaube"`, `"mein Team"`, `"100 Euro"` aber NICHT `"individuelle Bewegung"` (falsches Wort-Boundary).
- **Dependencies**: MT-0

### MT-2: TypeScript-Types
- **Goal**: `types.ts` mit `AugmentInput`, `AugmentOutput`, `CacheEntry`, `CacheStructure` Interfaces.
- **Files**:
  - `src/lib/llm/v8-1-augmentation/types.ts` (NEU)
- **Expected behavior**: Types matched ARCHITECTURE.md V8.1-Section JSONB-Cache-Struktur. `AugmentInput.deterministischerStufenText` fuer Fallback-Pfad. `AugmentOutput.isLlmAugmented` als Audit-Flag.
- **Verification**: TypeScript-Compile EXIT=0 nach Import in `augment.ts`. Keine `any`-Types.
- **Dependencies**: MT-1

### MT-3: Cache-Module
- **Goal**: `cache.ts` mit Read/Write capture_session.metadata.v8_1_llm_augmentation_cache + Tuple-Key-Match-Logik.
- **Files**:
  - `src/lib/llm/v8-1-augmentation/cache.ts` (NEU)
  - `src/lib/llm/v8-1-augmentation/__tests__/cache.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - `readCache(client, captureSessionId, cacheKey)` → `CacheStructure | null`
  - `writeCache(client, captureSessionId, cacheStructure)` → void (jsonb_set auf metadata-Slot)
  - `buildCacheKey(modelId, promptVersion)` → `"{modelId}|{promptVersion}"`
  - `isCacheHit(cached: CacheStructure | null, currentKey: string)` → boolean (matched `cache_key` mit currentKey)
- **Verification**: Vitest gegen Coolify-DB:
  - Read mit nicht-existentem capture_session_id → null
  - Read mit existierendem capture_session.metadata.v8_1_llm_augmentation_cache → CacheStructure
  - Write + Read-Back → Roundtrip
  - isCacheHit mit matched key → true
  - isCacheHit mit different model_id → false
  - isCacheHit mit different prompt_version → false
- **Dependencies**: MT-2, [[coolify-test-setup]]

### MT-4: augmentEmpfehlungsText Pure-Function
- **Goal**: Haupt-Logik. Cache-Check → Bedrock-Call (mit Sync-Wartezeit) → Tonality-Validation → Word-Count-Check → Cache-Write ODER Fallback.
- **Files**:
  - `src/lib/llm/v8-1-augmentation/augment.ts` (NEU)
  - `src/lib/llm/v8-1-augmentation/index.ts` (NEU, Re-Export)
  - `src/lib/llm/v8-1-augmentation/__tests__/augment.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Input: `AugmentInput[]` (Array von 3 Hebeln) + capture_session_id + Supabase-Client
  - Output: `Promise<AugmentOutput[]>` (3 augmentierte oder fallback-Texte)
  - Cache-Hit: keine LLM-Calls, gecachte Texte werden zurueckgegeben. error_log Entry `v8_1_llm_cache_hit`.
  - Cache-Miss: 3 sequentielle Bedrock-Calls. Pro Call: System-Prompt + User-Prompt mit Modul-Kontext + Stufen-Lookup-Text + Mandant-Kontext (anonymisiert). Temperature 0.3.
  - Post-Bedrock: Tonality-Blacklist-Check (matched → Fallback) + Word-Count-Check (>80 → Fallback) + Audit-Entry in ai_cost_ledger + error_log
  - Cache-Write nur wenn alle 3 Texte erfolgreich (atomare All-or-Nothing-Cache-Write)
  - Cost-Cap pro Session: Tracking ueber Promise-Chain, bei `sum(cost) > 0.05` → Rest-Fallback
- **Verification**: Vitest gegen Coolify-DB:
  - Cache-Hit (vorher writeCache + read) → 0 LLM-Calls, 3 Texte aus Cache, ai_cost_ledger erhaelt 3 Zero-Cost-Entries
  - Cache-Miss → 3 LLM-Calls (Mock Bedrock-Client), Tonality-Pass, Cache-Write happens
  - Tonality-Drift (Mock liefert "Ich glaube...") → Fallback fuer betroffenen Hebel, ai_cost_ledger Entry mit success_flag=false
  - Word-Count >80 (Mock liefert 100 Worte) → Fallback
  - Bedrock-Timeout (Mock throws) → Fallback fuer betroffenen Hebel
  - Cost-Cap-Hit (Mock liefert hohe Cost auf Call 1+2) → Rest-Fallback Call 3
- **Dependencies**: MT-3

### MT-5: ai_cost_ledger + error_log Integration
- **Goal**: Audit-Trail-Wrappers `recordLlmCall(client, entry)` und `recordCacheHit(client, ...)` als Pure-Functions, in `augment.ts` aus MT-4 aufgerufen.
- **Files**:
  - `src/lib/llm/v8-1-augmentation/audit.ts` (NEU)
  - `src/lib/llm/v8-1-augmentation/__tests__/audit.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - `recordLlmCall(client, { capture_session_id, modul_name, model_id, tokens_in, tokens_out, cost_usd, latency_ms, success })` → INSERT ai_cost_ledger
  - `recordCacheHit(client, { capture_session_id, model_id, prompt_version })` → INSERT error_log mit category `v8_1_llm_cache_hit`
  - `recordTonalityDrift(client, { capture_session_id, modul_name, drift_pattern })` → INSERT error_log mit category `v8_1_llm_tonality_drift`
- **Verification**: Vitest gegen Coolify-DB:
  - recordLlmCall fuer success-Call → ai_cost_ledger-Entry exists
  - recordCacheHit → error_log-Entry mit category `v8_1_llm_cache_hit`
  - recordTonalityDrift → error_log-Entry mit category `v8_1_llm_tonality_drift` und drift_pattern in metadata
- **Dependencies**: MT-4

### MT-6: SLC-161 Records-Update
- **Goal**: slices/INDEX.md SLC-161 `planned → in_progress`. features/INDEX.md FEAT-069 `planned → in_progress`. planning/backlog.json BL-143 `open → in_progress`. RPT-Schritt-Report im Worktree-Commit.
- **Files**:
  - `slices/INDEX.md` (UPDATE)
  - `features/INDEX.md` (UPDATE)
  - `planning/backlog.json` (UPDATE)
- **Expected behavior**: Status-Updates wie spec.
- **Verification**: `grep "in_progress" slices/INDEX.md | grep SLC-161` matched.
- **Dependencies**: MT-5

## Acceptance Criteria

- **AC-SLC-161-1**: `augmentEmpfehlungsText` mit Cache-Miss generiert 3 LLM-augmentierte Texte ueber Bedrock eu-central-1 Sonnet 3.5.
- **AC-SLC-161-2**: Cache-Hit liefert identische Texte (Reproduzierbarkeit) ohne erneuten LLM-Call.
- **AC-SLC-161-3**: Modell-ID-Change in ENV `BEDROCK_V8_1_MODEL_ID` invalidiert Cache automatisch (Tuple-Key-Mismatch).
- **AC-SLC-161-4**: Prompt-Version-Change in `V8_1_PROMPT_VERSION` invalidiert Cache automatisch.
- **AC-SLC-161-5**: Tonality-Drift (Blacklist-Treffer im LLM-Output) → Fallback auf deterministischen V8.0-Stufen-Text + audit-Entry.
- **AC-SLC-161-6**: Word-Count >80 → Fallback fuer betroffenen Hebel.
- **AC-SLC-161-7**: Bedrock-Timeout/Error → Fallback ohne sichtbaren Fehler.
- **AC-SLC-161-8**: Cost-Cap-Treffer ($0.05 Session-Sum) → Rest-Fallback fuer verbleibende Calls.
- **AC-SLC-161-9**: ai_cost_ledger erhaelt pro LLM-Call Entry mit Cost/Tokens/Latency/Success-Flag.
- **AC-SLC-161-10**: error_log erhaelt Cache-Hit-Entries (Zero-Cost-Audit) und Tonality-Drift-Entries.
- **AC-SLC-161-11**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN gegen Coolify-DB.

## Notable Risks / Dependencies

- **R1**: Bedrock-Adapter-Path im Repo unklar bis MT-4 inspect. Falls neu zu portieren: Aufwand +30min. Pflicht-Reuse pruefen!
- **R2**: ai_cost_ledger-Schema kann V8.1-Spalten nicht exakt mappen → /architecture DEC-167 verspricht "passt rein", aber MT-5 muss verifizieren (V6.3-Constraint-Erweiterung Migration 095).
- **R3**: Tonality-Blacklist-RegExp muss DE-Sprach-genug sein (`\bich\b` darf "individuelle" nicht treffen). Word-Boundary-Test in MT-1 ist Pflicht.
- **R4**: LLM-Latency-Variation 3-8s pro Call. Bei Vitest-Run gegen echte Bedrock-API kann das Test-Timeout >30s ueberschreiten. Lokales Mocking im Vitest empfohlen (echte Bedrock-Call nur in MT-4 Smoke-Test).
- **D1**: Hard-Dependency auf existing Bedrock-Adapter (V2/V6.3-tested).
- **D2**: Coolify-DB-Test-Setup per `coolify-test-setup.md` Pflicht.

## Worktree

- **Branch**: `v8-1-lead-conversion`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v8-1`
- **Cumulative**: SLC-161 + SLC-162 + SLC-163 alle im selben Worktree, Master-Merge am Schluss (analog V8.0)

## Next After SLC-161

**SLC-162 — V8.1 Outro-Renderer Replacement** (FEAT-067). Konsumiert `augmentEmpfehlungsText` aus diesem Slice. Reihenfolge fix per ARCHITECTURE.md V8.1 Dependency-Kette A→B→C.
