// Embedding Provider Factory
// Reads EMBEDDING_PROVIDER ENV to select the implementation.
// Default: titan (Amazon Titan Text Embeddings V2)

import type { EmbeddingProvider } from "./provider";
import { TitanEmbeddingProvider } from "./titan";

let instance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (instance) return instance;

  const provider = process.env.EMBEDDING_PROVIDER || "titan";

  switch (provider) {
    case "titan":
      instance = new TitanEmbeddingProvider();
      break;
    default:
      throw new Error(
        `Unknown embedding provider: "${provider}". Supported: titan`
      );
  }

  return instance;
}
