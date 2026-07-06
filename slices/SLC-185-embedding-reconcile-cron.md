# SLC-185 — Embedding-Reconcile-Cron (Self-Healing knowledge_chunks-Coverage)

- Feature: FEAT-102 (V10.2.1, ISSUE-112)
- Status: planned
- Priority: High
- Created: 2026-07-05
- Backlog: BL-528
- Migration: **keine** (DEC-262 — 0 Migration, 0 neue Tabellen)
- Worktree-Branch: `v10-2-1-embed-reconcile` (SaaS-Pflicht; Setup per Dev-System-Playbook `docs/playbooks/worktree-setup.md` — echtes `npm install` + `.env.local` für `next build`)
- Grounding: PRD §V10.2.1 · ARCHITECTURE §V10.2.1-Addendum (RPT-577) · DEC-262 · DEC-259 (ledger-frei) · DEC-261/ISSUE-112 (fire-and-forget-Ursache)

## Goal

Ein Self-Healing Reconciliation-Cron schließt RAG-Coverage-Lücken in `knowledge_chunks` automatisch: pro Mandant Count-Gap-Check (identische Query wie der V10.2-Coverage-Guard), bei Lücke `reembedTenantKnowledge` (Reuse V10.2, idempotent, fail-open), beobachtbar via `error_log`. Kein neues UI. Heilt Altlasten (Founder-Mandant "5 von 35") und künftige Lücken.

## In Scope

1. Cron-Route `GET /api/cron/knowledge-embed-reconcile` (1:1-Pattern `pending-signup-cleanup`).
2. Reconcile-Orchestrator `reconcileEmbeddings(admin, deps?)` mit injizierbaren Deps.
3. de-drift-Refactor `rag.ts`: Count-Gap-Logik als exportierter Helper `getTenantCoverage`.
4. Hermetische Vitest-Suites (Route + Orchestrator + rag-Extraktion).
5. RUNBOOK-Eintrag Coolify-Scheduled-Task `knowledge-embed-reconcile` (`*/10 * * * *`).

## Out of Scope

Echter `ai_jobs`-Job-Typ / Per-Job-Status · Only-missing-Optimierung (V1 re-embedded ALLE KUs eines Gap-Mandanten) · andere RAG-Quellen · Umbau des Fire-and-forget-Hot-Path (`handle-job.ts:208` / `handle-recondense.ts:207` bleiben unverändert) · Health-Dashboard/Alerting über error_log hinaus. Coolify-Task-ANLAGE + SC6-Live-Verifikation = `/deploy`-Phase, nicht dieser Slice.

## Verified-Against-Code-Reality (2026-07-05, Worktree slc178 @ `4624e8f`)

| Pfad | Klasse | Verifikation |
|---|---|---|
| `src/app/api/cron/knowledge-embed-reconcile/route.ts` | NEW | Verzeichnis existiert nicht (ls `src/app/api/cron/`) — keine Kollision |
| `src/app/api/cron/knowledge-embed-reconcile/__tests__/route.test.ts` | NEW | matched vitest-include `src/**/*.test.ts` (vitest.config.ts) |
| `src/lib/workspace/reconcile-embeddings.ts` | NEW | `src/lib/workspace/` enthält nur admin-gate, fazit, rag, reports, __tests__ |
| `src/lib/workspace/__tests__/reconcile-embeddings.test.ts` | NEW | Test-Dir existiert, Glob matched |
| `src/lib/workspace/rag.ts` | MODIFY | existiert; `DEFAULT_RAG_DEPS` :111, `defaultCount` :93, `reembedTenantKnowledge` :350 (exportiert, fail-open, `ReembedResult {ok, embedded}`), `REEMBED_MAX=1000` :35 |
| `src/lib/workspace/__tests__/rag.test.ts` | MODIFY | existiert (hermetisches Pattern vorhanden) |
| `docs/RUNBOOK.md` | MODIFY | Scheduled-Task-Doku-Pattern vorhanden (V9.1-Sektion :125ff als Vorlage) |

Symbole verifiziert: `captureInfo/captureException/captureWarning` aus `@/lib/logger` (Nutzung in `pending-signup-cleanup/route.ts`); `createAdminClient` aus `@/lib/supabase/admin`; Tenants-Enumeration-Primitive `from("tenants").select("id")` real in `src/lib/cockpit/load-cross-tenant.ts:27`; Cron-Pattern real: `runtime="nodejs"`, `dynamic="force-dynamic"`, `x-cron-secret` → **503** (ENV fehlt) / **403** (Mismatch) / 200 / 500-catch; `captureInfo` mit `metadata.category`.

**Schema-Grounding:** Count-Gap-Query verbatim aus `rag.ts` `defaultCount`: `knowledge_unit` (Filter `tenant_id`) vs. `knowledge_chunks` (Filter `tenant_id`, `source_type='knowledge_unit'`, `status='active'`), beide `select("id", {count:"exact", head:true})`. Idempotenz: bestehender Unique-Constraint `(source_type, source_id, chunk_index)` (Upsert in `reembedTenantKnowledge` nutzt ihn bereits). Keine neue Tabelle/Spalte/RPC.

**Spec-vs-DEC-Drift korrigiert:** PRD SC2 nennt "503/401" — reales Pattern + DEC-262 nutzen **403** bei Secret-Mismatch. DEC gewinnt: dieser Slice implementiert 503/403/200/500.

## Test-Infra-Klassifikation

`vitest.config.ts`: environment `node`, include `src/**/*.test.ts`, `npm run test` = `vitest run`. **Alle SLC-185-Tests = Pure-Mock-Vitest (lokal, hermetisch)** — Orchestrator hat injizierbare Deps (Architektur-Vorgabe), Route-Test mockt Orchestrator-Modul + Admin-Client via `vi.mock` (abweichend vom Coolify-DB-Test des `pending-signup-cleanup`-Vorbilds — PRD fordert explizit "hermetisch mit injizierten Deps"). Kein Coolify-DB-Sidecar nötig (0 Migration). Test-Count-AC inkrementell: Pre-MT-Baseline vor MT-1 erheben, Delta = konkrete Case-Liste unten.

## Micro-Tasks

### MT-1: rag.ts de-drift — `getTenantCoverage`-Extraktion [backend]
- Goal: Die Count-Gap-Logik als exportierten Helper herausziehen, damit Cron und RAG-Coverage-Guard dieselbe Query teilen (DEC-262).
- Files: `src/lib/workspace/rag.ts` (MODIFY), `src/lib/workspace/__tests__/rag.test.ts` (MODIFY)
- Expected behavior: `export async function getTenantCoverage(admin, tenantId): Promise<{ kuCount: number; chunkCount: number }>` — intern die bestehenden `defaultCount`-Queries (`knowledge_unit` vs. `knowledge_chunks` mit `source_type='knowledge_unit'` + `status='active'`, beide count-only/head). `DEFAULT_RAG_DEPS.countKnowledgeUnits/countIndexedChunks` delegieren darauf bzw. bleiben verhaltensidentisch — `askRag`-Verhalten unverändert.
- Verification (TDD): neue rag.test.ts-Cases — (a) getTenantCoverage liefert beide Counts, (b) chunk-Count filtert `source_type`+`status='active'`; alle bestehenden rag-Tests bleiben grün.
- Dependencies: keine

### MT-2: Reconcile-Orchestrator [backend]
- Goal: `reconcileEmbeddings(admin, deps?)` — Enumeration, per-Tenant-Gap-Check, sequentieller Re-Embed bei Lücke, Summary + Beobachtbarkeit.
- Files: `src/lib/workspace/reconcile-embeddings.ts` (NEW), `src/lib/workspace/__tests__/reconcile-embeddings.test.ts` (NEW)
- Expected behavior: Injizierbare Deps `{ listTenants, getCoverage, reembed }` (Defaults: `tenants.select("id")` / `getTenantCoverage` / `reembedTenantKnowledge`). Sequentiell je Mandant: bei `chunkCount < kuCount` → `reembed(admin, tenantId)`. `MAX_TENANTS_PER_RUN = 25` (Cap auf Re-Embed-Mandanten pro Lauf; Rest heilt nächster Tick, Cap-Hit → `capped: true` geloggt, keine stille Truncation). Fehler pro Mandant: `captureException`, fail-open (weiter mit nächstem). Rückgabe + `captureInfo`-Summary (`source: "cron:knowledge-embed-reconcile"`, `metadata: { category: "knowledge_embed_reconcile", tenantsChecked, tenantsWithGap, chunksReembedded, failures, capped }`).
- Verification (TDD, hermetisch): (a) Gap → reembed mit korrekter tenantId aufgerufen, `chunksReembedded` aggregiert aus `ReembedResult.embedded`; (b) No-Gap → 0 reembed-Calls, Safe-No-Op-Summary; (c) getCoverage-Throw bei Mandant 1 → Mandant 2 wird trotzdem verarbeitet, `failures=1`; (d) reembed liefert `{ok:false}` → zählt als failure; (e) 26 Gap-Mandanten → 25 reembed-Calls + `capped:true`; (f) captureInfo mit korrekter category + Counts.
- Dependencies: MT-1

### MT-3: Cron-Route [backend]
- Goal: Dünner Auth-gated HTTP-Einstieg für den Coolify-Tick.
- Files: `src/app/api/cron/knowledge-embed-reconcile/route.ts` (NEW), `src/app/api/cron/knowledge-embed-reconcile/__tests__/route.test.ts` (NEW)
- Expected behavior: 1:1-Port aus `src/app/api/cron/pending-signup-cleanup/route.ts` (Quell-Pfad-Header-Kommentar Pflicht): `runtime="nodejs"`, `dynamic="force-dynamic"`, GET, `x-cron-secret`-Guard (503 ohne `CRON_SECRET`-ENV + captureWarning / 403 Mismatch + captureWarning / 500-catch + captureException). Bei Pass: `createAdminClient()` → `reconcileEmbeddings(admin)` → `NextResponse.json({ ok: true, ...summary }, { status: 200 })`. Keine Business-Logik in der Route.
- Verification (hermetisch, `vi.mock` auf Orchestrator + Admin-Client): (a) 503 ohne ENV, Orchestrator NICHT aufgerufen (kein DB-Touch); (b) 403 bei Mismatch, Orchestrator NICHT aufgerufen; (c) 200 + Summary-JSON bei korrektem Secret; (d) 500 bei Orchestrator-Throw. ENV-Save/Restore-Pattern wie im Vorbild-Test.
- Dependencies: MT-2

### MT-4: RUNBOOK + Records [shared]
- Goal: Ops-Wissen + Projekt-Records konsistent.
- Files: `docs/RUNBOOK.md` (MODIFY), `slices/INDEX.md`, `planning/backlog.json`, `docs/STATE.md` (Records-Flip bei Slice-Abschluss)
- Expected behavior: RUNBOOK-Sektion V10.2.1 nach V9.1-Vorlage (:125ff): Schedule `*/10 * * * *`, `GET https://…/api/cron/knowledge-embed-reconcile`, Header `x-cron-secret: $CRON_SECRET`, Hinweis erster Lauf heilt Founder-Mandant-Altlast; Task-Anlage selbst = /deploy.
- Verification: Doku-Review; Records-Counts konsistent (mandatory-completion-report §8).
- Dependencies: MT-3

## Acceptance Criteria (Mapping SC1–SC6)

| AC | SC | Phase | Kriterium |
|---|---|---|---|
| AC-185-1 | SC1 | MT-2-Vitest | Gap-Mandant → reembed aufgerufen, Counts korrekt aggregiert (Live-Gegenprobe = SC6) |
| AC-185-2 | SC2 | MT-3-Vitest | 503 ohne Secret / 403 bei Mismatch, jeweils 0 Orchestrator-/DB-Calls |
| AC-185-3 | SC3 | MT-2-Vitest | Vollständiger Index → 0 Re-Embed (Safe-No-Op) |
| AC-185-4 | SC4 | MT-2-Vitest | captureInfo mit `category='knowledge_embed_reconcile'` + `{tenantsChecked, tenantsWithGap, chunksReembedded, failures, capped}` |
| AC-185-5 | SC5 | Slice-/qa | `tsc` 0 · `eslint` 0 · `vitest run` grün (+~12 neue Tests, 0 Regression gegen Pre-MT-1-Baseline) · `next build` PASS |
| AC-185-6 | SC6 | **/deploy (LIVE)** | Erster Prod-Lauf schließt Founder-Mandant-Lücke ("5 von 35" → chunkCount == kuCount), verifiziert via Count-Query auf Coolify-DB |

## Cross-Slice-Dependencies

- **Konsumiert (alles bereits auf origin/main deployed, V10.2 STABLE):** `reembedTenantKnowledge` + Count-Queries (`rag.ts`, SLC-184) · Cron-Pattern (`pending-signup-cleanup`, V7 SLC-135) · `captureInfo/captureException` (`logger.ts`) · `createAdminClient` · `tenants`-Enumeration (`load-cross-tenant.ts`).
- **Blockiert von:** nichts. **Blockiert:** nichts. Keine Stubs, keine pre-declared Artefakte.
- **Deploy-Kopplung:** AC-185-6 + Coolify-Task-Anlage laufen im /deploy V10.2.1 (eigener Schritt, `CRON_SECRET` existiert bereits in Coolify).

## Parallel-Readiness

| Slice ID | Parallel Group | MIG Reserved | File Touchpoints | Notes |
|---|---|---|---|---|
| SLC-185 | A (einziger Slice) | keine | rag.ts, reconcile-embeddings.ts, cron-route + 3 Test-Files, RUNBOOK.md | keine Parallel-Arbeit im Repo; Pre-Merge-Re-Check trotzdem Pflicht (Rebase + Tests minimum) |

## Risks

- R1 Reembed-all-on-gap → mehr Titan-Tokens; akzeptiert (idempotent, Internal-Scale, PRD R1).
- R2 Permanent fehlschlagende KU → Cron retryt jeden Tick, geloggt; kein Endlos-Schaden (PRD R2).
- R3 `rag.ts`-Refactor könnte `askRag` regressieren → Mitigation: verhaltensidentische Delegation + bestehende rag.test.ts-Suite als Regressions-Gate (MT-1-Verification).

## Security

`createAdminClient` (BYPASSRLS) nur hinter x-cron-secret-Gate (Architektur §7); alle Writes tenant-scoped via `reembedTenantKnowledge` (`.eq('tenant_id', …)`); Logs nur Counts + tenant_id, keine PII; EU-Residency unverändert (Titan V2 Frankfurt via `getEmbeddingProvider`, DEC-259 ledger-frei).
