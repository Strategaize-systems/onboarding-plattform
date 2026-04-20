// Evidence Text Chunking Module
// Splits extracted text into chunks suitable for KI-Mapping.
// Strategy: split at paragraph boundaries, fall back to sentence boundaries, then token boundaries.
// No overlap for document chunks (unlike meeting transcripts).

/** Approximate token count (4 chars per token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks of approximately maxTokens size.
 * Priority: paragraph boundaries > sentence boundaries > hard token limit.
 *
 * @param text - The full extracted text
 * @param maxTokens - Target maximum tokens per chunk (default: 700)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxTokens: number = 700): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // If entire text fits in one chunk, return as-is
  if (estimateTokens(trimmed) <= maxTokens) {
    return [trimmed];
  }

  // Split into paragraphs (double newline or more)
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    // If a single paragraph exceeds maxTokens, split it further
    if (paragraphTokens > maxTokens) {
      // Flush current chunk first
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      // Split large paragraph by sentences
      const sentenceChunks = splitBySentences(paragraph, maxTokens);
      chunks.push(...sentenceChunks);
      continue;
    }

    // Check if adding this paragraph exceeds the limit
    const combined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (estimateTokens(combined) > maxTokens) {
      // Flush current chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    } else {
      currentChunk = combined;
    }
  }

  // Flush remaining
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Split a paragraph by sentence boundaries when it exceeds maxTokens.
 * Falls back to hard character splits if individual sentences are too long.
 */
function splitBySentences(text: string, maxTokens: number): string[] {
  // Split on sentence endings (. ! ? followed by space or newline)
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // Single sentence exceeds maxTokens — hard split
    if (sentenceTokens > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      chunks.push(...hardSplit(sentence, maxTokens));
      continue;
    }

    const combined = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    if (estimateTokens(combined) > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk = combined;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Hard split text at approximately maxTokens boundaries (word-aware).
 */
function hardSplit(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const combined = current ? `${current} ${word}` : word;
    if (combined.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = combined;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
