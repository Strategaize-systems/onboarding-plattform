// V9.1 SLC-V9.1-A MT-1 — Synthetic-Corpus Loader + RFC-5322-Builder
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + Skeleton-Validation
// Spec: slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-1)
// DEC-195: 45-Email-Synthetic-Corpus, Telemetry-Output (Precision/Recall/F1), kein Gate.
//
// Purpose:
//   1. parseCorpusYaml(path) — load + parse test-fixtures/v91-mbox-corpus/synthetic.yaml
//   2. entryToEml(entry) — build minimal RFC-5322 string per entry (downstream-Verwendung
//      in MT-4 Webhook-Tests, MT-1 nutzt direkte Felder-Uebergabe via
//      corpusEntryToPromptInput statt EML-Parsing).
//   3. corpusEntryToPromptInput(entry) — map CorpusEntry to PreFilterEmailPromptInput
//      (V9 Worker-Pattern Reuse, src/lib/bulk-email/pre-filter/prompt.ts).
//
// Reuse-Quelle (V9 Worker-Pattern):
//   - src/workers/bulk-email/handle-pre-filter-job.ts (Haiku-Call-Pattern)
//   - src/lib/ai/bedrock-haiku/index.ts (invokeHaiku + Strict-JSON-Schema-Validation)
//   - src/lib/bulk-email/pre-filter/{prompt,labels}.ts (System-Prompt + 6-Label-Schema)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";

import type { PreFilterEmailPromptInput } from "../../../src/lib/bulk-email/pre-filter/prompt";

export type GroundTruthClassification = "valuable" | "skip";

export interface CorpusEntry {
  id: string;
  expected_classification: GroundTruthClassification;
  expected_pattern: string | null;
  reasoning: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface CorpusYamlRoot {
  corpus: CorpusEntry[];
}

const DEFAULT_CORPUS_PATH =
  "test-fixtures/v91-mbox-corpus/synthetic.yaml";

export function parseCorpusYaml(corpusPath?: string): CorpusEntry[] {
  const fullPath = resolve(
    process.cwd(),
    corpusPath ?? DEFAULT_CORPUS_PATH,
  );
  const raw = readFileSync(fullPath, "utf-8");
  const parsed = parseYaml(raw) as CorpusYamlRoot;
  if (!parsed?.corpus || !Array.isArray(parsed.corpus)) {
    throw new Error(
      `Corpus YAML at ${fullPath} missing 'corpus' array`,
    );
  }
  return parsed.corpus;
}

/**
 * Build a minimal RFC-5322 MIME string for downstream MT-4 webhook-tests.
 * MT-1 does not parse the EML — it uses corpusEntryToPromptInput directly.
 */
export function entryToEml(entry: CorpusEntry): string {
  const headers = [
    `From: ${entry.from}`,
    `To: ${entry.to}`,
    `Subject: ${entry.subject}`,
    `Date: ${entry.date}`,
    `Message-ID: <${entry.id}@v91-synthetic.strategaize.test>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
  ].join("\r\n");
  return `${headers}\r\n\r\n${entry.body}`;
}

/**
 * Map CorpusEntry to V9 PreFilterEmailPromptInput format. The
 * message_id is a fresh UUID — the corpus-id maps to it for
 * ground-truth-lookup in synthetic-corpus-validation.test.ts.
 */
export function corpusEntryToPromptInput(
  entry: CorpusEntry,
  messageId?: string,
): PreFilterEmailPromptInput {
  return {
    message_id: messageId ?? randomUUID(),
    subject: entry.subject,
    from_address: entry.from,
    to_addresses: [entry.to],
    body_text: entry.body,
  };
}
