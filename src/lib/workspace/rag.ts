// V10.2 SLC-184 MT-2 — RAG-Frage-Antwort-Kette mit Coverage-Guard (Berater-Workspace).
//
// Slice: SLC-184 / FEAT-101 — RAG-Frage-Antwort + Coverage-Guard + Sprach-Eingabe.
// DECs: DEC-258 (fail-closed; tenant_id server-derived), DEC-259 (error_log-Audit,
//       KEIN ai_cost_ledger), DEC-261 / ISSUE-112 (Coverage-Guard Pflicht, R-184-1).
//
// Ablauf:
//   1. Coverage-Guard: count(knowledge_unit) vs count(knowledge_chunks,
//      source_type='knowledge_unit') fuer den Mandanten. Bei fehlender Indexierung
//      (fire-and-forget embedKnowledgeUnits, ISSUE-112) → ehrlicher Hinweis statt
//      erfundener Antwort.
//   2. Frage-Embedding (Titan V2, eu-central-1).
//   3. rpc_search_knowledge_chunks(embedding, tenant, limit) → Top-Chunks.
//   4. Sonnet-Antwort (chatWithLLM, ConverseCommand, eu-central-1) — geerdet in den
//      Chunks, mit Zitier-Instruktion; plus Quellenliste (Typ/Titel/Datum/Snippet).
//
// Fail-open: jeder Embedding-/Such-/LLM-Fehler → { ok:false } + captureException,
// nie ein Throw. Fail-closed (kein Mandant) wird in rag-action.ts VOR askRag gebunden.
//
// Pattern-Reuse:
//   - src/lib/ai/embeddings (getEmbeddingProvider().embed)
//   - src/lib/llm.ts chatWithLLM (Sonnet 4, ConverseCommand, eu-central-1)
//   - src/workers/condensation/embed-knowledge-units.ts (Embed+Upsert-Shape fuer Re-Embed)

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmbeddingProvider } from "@/lib/ai/embeddings";
import { chatWithLLM } from "@/lib/llm";
import { captureException } from "@/lib/logger";

// Anzahl Chunks, die als Kontext an das LLM gehen. pgvector-Top-N reicht — kein
// zusaetzliches Re-Ranking (F-B2: bewusst schlank fuer V10.2).
const SEARCH_LIMIT = 8;
const SNIPPET_CHARS = 240;
const REEMBED_MAX = 1000;

// ─── Ergebnis-Typen ───

export type CoverageLevel = "none" | "partial" | "full";

export interface RagCoverage {
  level: CoverageLevel;
  kuCount: number;
  chunkCount: number;
  /** Ehrlicher Hinweis fuer den Nutzer; null wenn Coverage vollstaendig. */
  warning: string | null;
  /** true wenn ein Re-Embed sinnvoll ist (chunkCount < kuCount). */
  canReembed: boolean;
}

export interface RagSource {
  source_type: string;
  title: string | null;
  date: string | null;
  snippet: string;
  similarity: number;
}

export interface AskRagResult {
  /** Belegte Antwort — null, wenn keine belastbare Grundlage existiert. */
  answer: string | null;
  sources: RagSource[];
  coverage: RagCoverage;
}

export type AskRagOutcome =
  | { ok: true; result: AskRagResult }
  | { ok: false; error: "embedding_failed" | "search_failed" | "llm_failed" };

// ─── Injizierbare Abhaengigkeiten (hermetische Tests) ───

interface RagSearchRow {
  id: string;
  source_type: string;
  source_id: string;
  chunk_text: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

export interface AskRagDeps {
  countKnowledgeUnits: (admin: SupabaseClient, tenantId: string) => Promise<number>;
  countIndexedChunks: (admin: SupabaseClient, tenantId: string) => Promise<number>;
  embed: (text: string) => Promise<number[]>;
  search: (
    admin: SupabaseClient,
    embedding: number[],
    tenantId: string,
    limit: number,
  ) => Promise<RagSearchRow[]>;
  chat: (system: string, user: string) => Promise<string>;
}

async function defaultCount(
  admin: SupabaseClient,
  table: string,
  tenantId: string,
  extra: Record<string, string> = {},
): Promise<number> {
  let q = admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  for (const [col, val] of Object.entries(extra)) {
    q = q.eq(col, val);
  }
  const { count } = await q;
  return count ?? 0;
}

export const DEFAULT_RAG_DEPS: AskRagDeps = {
  countKnowledgeUnits: (admin, tenantId) =>
    defaultCount(admin, "knowledge_unit", tenantId),
  countIndexedChunks: (admin, tenantId) =>
    defaultCount(admin, "knowledge_chunks", tenantId, {
      source_type: "knowledge_unit",
      status: "active",
    }),
  embed: (text) => getEmbeddingProvider().embed(text),
  search: async (admin, embedding, tenantId, limit) => {
    const { data, error } = await admin.rpc("rpc_search_knowledge_chunks", {
      // vector(1024) via PostgREST als Vektor-Literal "[...]" uebergeben
      // (analog embed-knowledge-units.ts: JSON.stringify(embedding)).
      p_query_embedding: JSON.stringify(embedding),
      p_tenant_id: tenantId,
      p_limit: limit,
      p_source_type: "knowledge_unit",
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as RagSearchRow[];
  },
  chat: (system, user) =>
    chatWithLLM(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0, maxTokens: 900 },
    ),
};

// V10.2.1 SLC-185 MT-1 (DEC-262 de-drift): die eine Wahrheit der Gap-Definition.
// Cron-Reconciliation (reconcile-embeddings.ts) und RAG-Coverage-Guard (askRag)
// teilen dieselbe Count-Gap-Query — Delegation auf DEFAULT_RAG_DEPS statt Kopie.
export async function getTenantCoverage(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ kuCount: number; chunkCount: number }> {
  const [kuCount, chunkCount] = await Promise.all([
    DEFAULT_RAG_DEPS.countKnowledgeUnits(admin, tenantId),
    DEFAULT_RAG_DEPS.countIndexedChunks(admin, tenantId),
  ]);
  return { kuCount, chunkCount };
}

// ─── Coverage-Guard ───

function buildCoverage(kuCount: number, chunkCount: number): RagCoverage {
  if (kuCount === 0) {
    return {
      level: "none",
      kuCount,
      chunkCount,
      warning:
        "Für diesen Mandanten sind noch keine verdichteten Erkenntnisse erfasst — eine belastbare Antwort ist nicht möglich.",
      canReembed: false,
    };
  }
  if (chunkCount === 0) {
    return {
      level: "none",
      kuCount,
      chunkCount,
      warning: `Die ${kuCount} Erkenntnisse dieses Mandanten sind noch nicht indexiert. Eine belastbare Antwort ist erst nach der Indexierung möglich.`,
      canReembed: true,
    };
  }
  if (chunkCount < kuCount) {
    return {
      level: "partial",
      kuCount,
      chunkCount,
      warning: `Hinweis: Erst ${chunkCount} von ${kuCount} Erkenntnissen sind indexiert — die Antwort kann unvollständig sein.`,
      canReembed: true,
    };
  }
  return { level: "full", kuCount, chunkCount, warning: null, canReembed: false };
}

function toSource(row: RagSearchRow): RagSource {
  const md = row.metadata ?? {};
  const title = typeof md.title === "string" ? md.title : null;
  const date =
    typeof md.date === "string"
      ? md.date
      : typeof md.created_at === "string"
        ? md.created_at
        : null;
  return {
    source_type: row.source_type,
    title,
    date,
    snippet:
      row.chunk_text.length > SNIPPET_CHARS
        ? `${row.chunk_text.slice(0, SNIPPET_CHARS)}…`
        : row.chunk_text,
    similarity: row.similarity,
  };
}

const SYSTEM_PROMPT =
  "Du bist ein Analyse-Assistent für einen Unternehmensberater. " +
  "Beantworte die Frage AUSSCHLIESSLICH auf Basis der nummerierten Kontext-Ausschnitte. " +
  "Erfinde nichts und nutze kein Wissen außerhalb der Ausschnitte. " +
  "Wenn die Ausschnitte die Frage nicht beantworten, sage das offen. " +
  "Antworte knapp und sachlich auf Deutsch und belege deine Aussagen mit Ziffern wie [1], [2].";

/**
 * RAG-Frage-Antwort gegen die knowledge_chunks eines Mandanten.
 *
 * Erwartet einen validierten, non-leeren tenantId (Fail-closed-Bindung erfolgt in
 * rag-action.ts). Wirft NIE — jeder Fehler wird auditiert und als { ok:false }
 * zurueckgegeben (fail-open). Bei fehlender Indexierung (Coverage-Guard) wird KEINE
 * Antwort erfunden, sondern ein ehrlicher Hinweis geliefert.
 */
export async function askRag(
  admin: SupabaseClient,
  tenantId: string,
  question: string,
  deps: AskRagDeps = DEFAULT_RAG_DEPS,
): Promise<AskRagOutcome> {
  // 1. Coverage-Guard zuerst (guenstig, verhindert LLM-Call bei leerem Index).
  let coverage: RagCoverage;
  try {
    const [kuCount, chunkCount] = await Promise.all([
      deps.countKnowledgeUnits(admin, tenantId),
      deps.countIndexedChunks(admin, tenantId),
    ]);
    coverage = buildCoverage(kuCount, chunkCount);
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/rag/coverage",
      metadata: { tenantId },
    });
    return { ok: false, error: "search_failed" };
  }

  // Keine Grundlage → ehrlicher Hinweis, keine erfundene Antwort (ISSUE-112).
  if (coverage.level === "none") {
    return { ok: true, result: { answer: null, sources: [], coverage } };
  }

  // 2. Frage-Embedding.
  let embedding: number[];
  try {
    embedding = await deps.embed(question);
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/rag/embed",
      metadata: { tenantId },
    });
    return { ok: false, error: "embedding_failed" };
  }

  // 3. Similarity Search.
  let rows: RagSearchRow[];
  try {
    rows = await deps.search(admin, embedding, tenantId, SEARCH_LIMIT);
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/rag/search",
      metadata: { tenantId },
    });
    return { ok: false, error: "search_failed" };
  }

  // Semantischer Treffer-Leerlauf trotz vorhandenem Index → keine erfundene Antwort.
  if (rows.length === 0) {
    return {
      ok: true,
      result: {
        answer: null,
        sources: [],
        coverage: {
          ...coverage,
          warning:
            coverage.warning ??
            "Zur Frage wurden keine passenden Erkenntnisse gefunden.",
        },
      },
    };
  }

  // 4. Sonnet-Antwort, geerdet in den Chunks.
  const context = rows
    .map((r, i) => {
      const md = r.metadata ?? {};
      const label =
        typeof md.title === "string" ? `${r.source_type}, ${md.title}` : r.source_type;
      return `[${i + 1}] (${label}) ${r.chunk_text}`;
    })
    .join("\n\n");
  const userPrompt = `Frage: ${question}\n\nKontext-Ausschnitte:\n${context}`;

  let answer: string;
  try {
    answer = (await deps.chat(SYSTEM_PROMPT, userPrompt)).trim();
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/rag/answer",
      metadata: { tenantId },
    });
    return { ok: false, error: "llm_failed" };
  }

  return {
    ok: true,
    result: {
      answer: answer.length > 0 ? answer : null,
      sources: rows.map(toSource),
      coverage,
    },
  };
}

// ─── Re-Embed-Trigger (Coverage-Luecke schliessen) ───

interface ReembedDeps {
  embedBatch: (texts: string[]) => Promise<number[][]>;
  modelId: () => string;
}

const DEFAULT_REEMBED_DEPS: ReembedDeps = {
  embedBatch: (texts) => getEmbeddingProvider().embedBatch(texts),
  modelId: () => getEmbeddingProvider().modelId(),
};

export interface ReembedResult {
  ok: boolean;
  embedded: number;
}

interface KnowledgeUnitRow {
  id: string;
  tenant_id: string;
  block_key: string;
  title: string;
  body: string;
  unit_type: string;
  confidence: string;
  capture_session_id: string;
  block_checkpoint_id: string;
}

/**
 * Indexiert die knowledge_unit-Rows eines Mandanten als knowledge_chunks nach.
 *
 * Reuse des Embed+Upsert-Shapes aus src/workers/condensation/embed-knowledge-units.ts,
 * bewusst OHNE den ai_cost_ledger-Write: DEC-259 (RAG-Pfad schreibt keinen Ledger)
 * und der Ledger-FK (ai_cost_ledger.job_id → ai_jobs) waere fuer diesen ad-hoc
 * Re-Embed ohne echte ai_jobs-Row nicht erfuellbar. Idempotent via Unique-Constraint
 * (source_type, source_id, chunk_index). Fail-open: wirft nie.
 */
export async function reembedTenantKnowledge(
  admin: SupabaseClient,
  tenantId: string,
  deps: ReembedDeps = DEFAULT_REEMBED_DEPS,
): Promise<ReembedResult> {
  try {
    const { data, error } = await admin
      .from("knowledge_unit")
      .select(
        "id, tenant_id, block_key, title, body, unit_type, confidence, capture_session_id, block_checkpoint_id",
      )
      .eq("tenant_id", tenantId)
      .limit(REEMBED_MAX);

    if (error) throw new Error(error.message);
    const kus = (data ?? []) as KnowledgeUnitRow[];
    if (kus.length === 0) return { ok: true, embedded: 0 };

    const texts = kus.map((ku) => `${ku.title}\n\n${ku.body}`);
    const embeddings = await deps.embedBatch(texts);
    const model = deps.modelId();

    const chunks = kus.map((ku, idx) => ({
      tenant_id: ku.tenant_id,
      source_type: "knowledge_unit",
      source_id: ku.id,
      chunk_index: 0,
      chunk_text: texts[idx],
      embedding: JSON.stringify(embeddings[idx]),
      metadata: JSON.stringify({
        title: ku.title,
        block_key: ku.block_key,
        unit_type: ku.unit_type,
        confidence: ku.confidence,
        capture_session_id: ku.capture_session_id,
        block_checkpoint_id: ku.block_checkpoint_id,
        reembed_source: "workspace/rag/reembed",
      }),
      embedding_model: model,
      status: "active",
    }));

    const { error: upsertError } = await admin
      .from("knowledge_chunks")
      .upsert(chunks, { onConflict: "source_type,source_id,chunk_index" });
    if (upsertError) throw new Error(upsertError.message);

    return { ok: true, embedded: chunks.length };
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      source: "workspace/rag/reembed",
      metadata: { tenantId },
    });
    return { ok: false, embedded: 0 };
  }
}
