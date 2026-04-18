-- Migration 036: pgvector Extension + knowledge_chunks Tabelle
-- Datum: 2026-04-18
-- Slice: SLC-008 (RAG-Infrastruktur-Vorbereitung)
-- Dependencies: 021 (knowledge_unit), 035 (ai_cost_ledger)
--
-- Setzt die Infrastruktur fuer semantische Suche ueber Knowledge Units
-- und zukuenftige RAG-Use-Cases (Cross-Block-Analyse, Meeting-Transkripte).
-- Pattern: rag-embedding-pattern.md (Dev System Rule)

-- ============================================================
-- PGVECTOR Extension
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ai_cost_ledger: Rolle 'embedding' ergaenzen (Migration 035 deployed ohne)
-- ============================================================

ALTER TABLE ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;
ALTER TABLE ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IN ('analyst', 'challenger', 'chat', 'memory', 'embedding'));

-- ============================================================
-- KNOWLEDGE_CHUNKS — Embedding-Speicher fuer semantische Suche
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid            NOT NULL REFERENCES tenants ON DELETE CASCADE,
  source_type     text            NOT NULL,
  source_id       uuid            NOT NULL,
  chunk_index     integer         NOT NULL,
  chunk_text      text            NOT NULL,
  embedding       vector(1024)    NOT NULL,
  metadata        jsonb           DEFAULT '{}',
  embedding_model text            NOT NULL,
  status          text            DEFAULT 'active'
                                  CHECK (status IN ('active', 'pending', 'failed', 'deleted')),
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now()
);

-- HNSW-Index fuer schnelle Cosine Similarity Search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Lookup-Indizes
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source
  ON knowledge_chunks (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant
  ON knowledge_chunks (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_status
  ON knowledge_chunks (status)
  WHERE status != 'active';

-- Unique Constraint: kein doppeltes Embedding fuer gleichen Source+Chunk
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_unique
  ON knowledge_chunks (source_type, source_id, chunk_index);

-- updated_at Trigger
DROP TRIGGER IF EXISTS trg_knowledge_chunks_set_updated_at ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_set_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: Cross-Tenant Vollzugriff
CREATE POLICY "knowledge_chunks_admin_full"
  ON knowledge_chunks FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant: Lesen eigener Chunks
CREATE POLICY "knowledge_chunks_tenant_read"
  ON knowledge_chunks FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- GRANTs
GRANT ALL ON knowledge_chunks TO service_role;
GRANT SELECT ON knowledge_chunks TO authenticated;

-- ============================================================
-- RPC: Similarity Search (fuer zukuenftige API-Nutzung)
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_search_knowledge_chunks(
  p_query_embedding vector(1024),
  p_tenant_id uuid,
  p_limit integer DEFAULT 20,
  p_source_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.source_type,
    kc.source_id,
    kc.chunk_text,
    kc.metadata,
    (1 - (kc.embedding <=> p_query_embedding))::float AS similarity
  FROM knowledge_chunks kc
  WHERE kc.status = 'active'
    AND kc.tenant_id = p_tenant_id
    AND (p_source_type IS NULL OR kc.source_type = p_source_type)
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_search_knowledge_chunks(vector(1024), uuid, integer, text)
  TO service_role, authenticated;
