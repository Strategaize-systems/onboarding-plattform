// Embedding Provider Interface
// All embedding providers must implement this interface.
// Pattern: rag-embedding-pattern.md (Dev System Rule)

export interface EmbeddingProvider {
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Number of dimensions in the embedding vector */
  dimensions(): number;

  /** Model identifier (stored alongside embeddings for re-embedding tracking) */
  modelId(): string;
}
