// V10.2 SLC-184 MT-2 — Hermetische Tests fuer askRag + reembedTenantKnowledge.
//
// Kein echter AWS-/DB-Call: alle Seiteneffekte (Coverage-Counts, Embed, Search, Chat)
// via AskRagDeps injiziert; @/lib/logger gestubbt. Verifiziert:
//   1. Happy-Path (full coverage) → belegte Antwort + Quellen
//   2. Coverage "none" (0 KUs) → keine Antwort, kein Embed/Chat
//   3. Coverage-Luecke (KUs vorhanden, 0 Chunks) → keine Antwort, canReembed=true
//   4. Partial-Coverage → Antwort + Warnung
//   5. Semantischer Leerlauf (0 Treffer trotz Index) → keine erfundene Antwort
//   6. LLM-Fehler → fail-open { ok:false, error:"llm_failed" }
//   7. Embedding-Fehler → { ok:false, error:"embedding_failed" }
//   8. reembedTenantKnowledge → Chunk-Count / leerer Mandant

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { captureException } from "@/lib/logger";
import {
  askRag,
  reembedTenantKnowledge,
  type AskRagDeps,
} from "../rag";

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

const admin = {} as SupabaseClient;

function makeDeps(over: Partial<AskRagDeps> = {}): AskRagDeps {
  return {
    countKnowledgeUnits: vi.fn().mockResolvedValue(3),
    countIndexedChunks: vi.fn().mockResolvedValue(3),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    search: vi.fn().mockResolvedValue([
      {
        id: "c1",
        source_type: "knowledge_unit",
        source_id: "k1",
        chunk_text: "Der Mandant hat ein Cashflow-Risiko im Q3.",
        metadata: { title: "Cashflow-Risiko", date: "2026-06-01" },
        similarity: 0.82,
      },
    ]),
    chat: vi.fn().mockResolvedValue("Es besteht ein Cashflow-Risiko [1]."),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("askRag", () => {
  it("Happy-Path: full coverage → belegte Antwort + gemappte Quellen", async () => {
    const deps = makeDeps();
    const out = await askRag(admin, "t1", "Welche Risiken?", deps);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toContain("Cashflow-Risiko");
    expect(out.result.coverage.level).toBe("full");
    expect(out.result.coverage.warning).toBeNull();
    expect(out.result.sources).toHaveLength(1);
    expect(out.result.sources[0]).toMatchObject({
      source_type: "knowledge_unit",
      title: "Cashflow-Risiko",
      date: "2026-06-01",
      similarity: 0.82,
    });
    expect(deps.chat).toHaveBeenCalledTimes(1);
  });

  it("Coverage 'none' (0 KUs): keine Antwort, kein Embed/Chat", async () => {
    const deps = makeDeps({
      countKnowledgeUnits: vi.fn().mockResolvedValue(0),
      countIndexedChunks: vi.fn().mockResolvedValue(0),
    });
    const out = await askRag(admin, "t1", "Welche Risiken?", deps);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toBeNull();
    expect(out.result.coverage.level).toBe("none");
    expect(out.result.coverage.canReembed).toBe(false);
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("Coverage-Luecke (KUs vorhanden, 0 Chunks): keine Antwort, canReembed=true", async () => {
    const deps = makeDeps({
      countKnowledgeUnits: vi.fn().mockResolvedValue(5),
      countIndexedChunks: vi.fn().mockResolvedValue(0),
    });
    const out = await askRag(admin, "t1", "Frage?", deps);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toBeNull();
    expect(out.result.coverage.level).toBe("none");
    expect(out.result.coverage.canReembed).toBe(true);
    expect(out.result.coverage.warning).toContain("nicht indexiert");
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it("Partial-Coverage: Antwort + Warnung + canReembed", async () => {
    const deps = makeDeps({
      countKnowledgeUnits: vi.fn().mockResolvedValue(10),
      countIndexedChunks: vi.fn().mockResolvedValue(4),
    });
    const out = await askRag(admin, "t1", "Frage?", deps);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toContain("Cashflow-Risiko");
    expect(out.result.coverage.level).toBe("partial");
    expect(out.result.coverage.canReembed).toBe(true);
    expect(out.result.coverage.warning).toContain("4 von 10");
  });

  it("Semantischer Leerlauf (0 Treffer trotz Index): keine erfundene Antwort", async () => {
    const deps = makeDeps({ search: vi.fn().mockResolvedValue([]) });
    const out = await askRag(admin, "t1", "Frage?", deps);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.answer).toBeNull();
    expect(out.result.sources).toHaveLength(0);
    expect(out.result.coverage.warning).toContain("keine passenden");
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("LLM-Fehler: fail-open { ok:false, error:'llm_failed' } + Audit", async () => {
    const deps = makeDeps({
      chat: vi.fn().mockRejectedValue(new Error("bedrock down")),
    });
    const out = await askRag(admin, "t1", "Frage?", deps);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("llm_failed");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("Embedding-Fehler: { ok:false, error:'embedding_failed' }", async () => {
    const deps = makeDeps({
      embed: vi.fn().mockRejectedValue(new Error("titan down")),
    });
    const out = await askRag(admin, "t1", "Frage?", deps);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("embedding_failed");
  });
});

// ─── reembedTenantKnowledge ───

function tableResult(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.limit = chain;
  builder.upsert = () => ({ error: null });
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data, error: null });
  return builder;
}

function fakeAdmin(kus: unknown[]): SupabaseClient {
  return {
    from: (table: string) =>
      table === "knowledge_unit" ? tableResult(kus) : tableResult([]),
  } as unknown as SupabaseClient;
}

describe("reembedTenantKnowledge", () => {
  const reembedDeps = {
    embedBatch: vi.fn().mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]),
    modelId: vi.fn().mockReturnValue("amazon.titan-embed-text-v2:0"),
  };

  it("embedded = Anzahl der KUs", async () => {
    const admin2 = fakeAdmin([
      {
        id: "k1",
        tenant_id: "t1",
        block_key: "b",
        title: "T1",
        body: "B1",
        unit_type: "finding",
        confidence: "high",
        capture_session_id: "s",
        block_checkpoint_id: "cp",
      },
      {
        id: "k2",
        tenant_id: "t1",
        block_key: "b",
        title: "T2",
        body: "B2",
        unit_type: "risk",
        confidence: "medium",
        capture_session_id: "s",
        block_checkpoint_id: "cp",
      },
    ]);
    const res = await reembedTenantKnowledge(admin2, "t1", reembedDeps);
    expect(res.ok).toBe(true);
    expect(res.embedded).toBe(2);
    expect(reembedDeps.embedBatch).toHaveBeenCalledTimes(1);
  });

  it("leerer Mandant → embedded 0, kein Embed-Call", async () => {
    reembedDeps.embedBatch.mockClear();
    const res = await reembedTenantKnowledge(fakeAdmin([]), "t1", reembedDeps);
    expect(res).toEqual({ ok: true, embedded: 0 });
    expect(reembedDeps.embedBatch).not.toHaveBeenCalled();
  });
});
