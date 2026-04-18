// Amazon Titan Text Embeddings V2 via Bedrock eu-central-1
// DSGVO-konform: gleicher Provider, gleiche Region wie LLM (DEC-006)
// Kosten: ~$0.02/MTok (vernachlaessigbar)

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { EmbeddingProvider } from "./provider";

const DEFAULT_MODEL = "amazon.titan-embed-text-v2:0";
const DEFAULT_DIMENSIONS = 1024;
const MAX_BATCH_SIZE = 25; // Titan V2 limit per request

export class TitanEmbeddingProvider implements EmbeddingProvider {
  private client: BedrockRuntimeClient;
  private model: string;
  private dims: number;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.EMBEDDING_REGION || process.env.AWS_REGION || "eu-central-1",
    });
    this.model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
    this.dims = parseInt(process.env.EMBEDDING_DIMENSIONS || String(DEFAULT_DIMENSIONS), 10);
  }

  async embed(text: string): Promise<number[]> {
    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText: text,
        dimensions: this.dims,
        normalize: true,
      }),
    });

    const response = await this.client.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    return body.embedding as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Process in batches of MAX_BATCH_SIZE
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...embeddings);
    }

    return results;
  }

  dimensions(): number {
    return this.dims;
  }

  modelId(): string {
    return this.model;
  }
}
