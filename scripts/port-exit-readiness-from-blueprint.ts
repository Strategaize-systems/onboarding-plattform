#!/usr/bin/env npx ts-node --esm
/**
 * One-time extraction: Blueprint catalog-v1.0.json → Onboarding template blocks JSONB.
 * Output: data/seed/exit-readiness-v1.0.0.json
 *
 * Run: npx ts-node --esm scripts/port-exit-readiness-from-blueprint.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";

interface BlueprintQuestion {
  frage_id: string;
  block: string;
  ebene: string;
  unterbereich: string;
  fragetext: string;
  owner_dependency: boolean;
  deal_blocker: boolean;
  sop_trigger: boolean;
  ko_hart: boolean;
  ko_soft: boolean;
  block_weight: number;
  position: number;
}

interface BlueprintCatalog {
  version: string;
  blueprint_version: string;
  questions: BlueprintQuestion[];
}

interface TemplateQuestion {
  id: string;
  frage_id: string;
  text: string;
  ebene: string;
  unterbereich: string;
  position: number;
  owner_dependency: boolean;
  deal_blocker: boolean;
  sop_trigger: boolean;
  ko_hart: boolean;
  ko_soft: boolean;
}

interface TemplateBlock {
  id: string;
  key: string;
  title: Record<string, string>;
  description: string | null;
  order: number;
  required: boolean;
  weight: number;
  questions: TemplateQuestion[];
}

const BLOCK_TITLES: Record<string, Record<string, string>> = {
  A: { de: "Geschäftsmodell & Markt", en: "Business Model & Market", nl: "Bedrijfsmodel & Markt" },
  B: { de: "Führung & Organisation", en: "Leadership & Organization", nl: "Leiderschap & Organisatie" },
  C: { de: "Prozesse & Abläufe", en: "Processes & Operations", nl: "Processen & Operaties" },
  D: { de: "Zahlen & Steuerung", en: "Financials & Controlling", nl: "Cijfers & Sturing" },
  E: { de: "IT & Systeme", en: "IT & Systems", nl: "IT & Systemen" },
  F: { de: "Wissen & Kompetenz", en: "Knowledge & Competency", nl: "Kennis & Competentie" },
  G: { de: "Kommunikation & Information", en: "Communication & Information", nl: "Communicatie & Informatie" },
  H: { de: "Personal & Skalierbarkeit", en: "HR & Scalability", nl: "Personeel & Schaalbaarheid" },
  I: { de: "Recht & Struktur", en: "Legal & Structure", nl: "Recht & Structuur" },
};

const BLOCK_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

import { fileURLToPath } from "url";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const catalogPath = join(repoRoot, "scripts", "catalog-v1.0.json");
const outputPath = join(repoRoot, "data", "seed", "exit-readiness-v1.0.0.json");

const raw = readFileSync(catalogPath, "utf-8");
const catalog: BlueprintCatalog = JSON.parse(raw);

const grouped = new Map<string, BlueprintQuestion[]>();
for (const q of catalog.questions) {
  if (!grouped.has(q.block)) grouped.set(q.block, []);
  grouped.get(q.block)!.push(q);
}

const blocks: TemplateBlock[] = BLOCK_ORDER.map((key, idx) => {
  const questions = grouped.get(key) ?? [];
  questions.sort((a, b) => a.position - b.position);

  return {
    id: randomUUID(),
    key,
    title: BLOCK_TITLES[key],
    description: null,
    order: idx + 1,
    required: true,
    weight: questions[0]?.block_weight ?? 1.0,
    questions: questions.map((q) => ({
      id: randomUUID(),
      frage_id: q.frage_id,
      text: q.fragetext,
      ebene: q.ebene,
      unterbereich: q.unterbereich,
      position: q.position,
      owner_dependency: q.owner_dependency,
      deal_blocker: q.deal_blocker,
      sop_trigger: q.sop_trigger,
      ko_hart: q.ko_hart,
      ko_soft: q.ko_soft,
    })),
  };
});

const totalQuestions = blocks.reduce((sum, b) => sum + b.questions.length, 0);

const seed = {
  template: {
    slug: "exit_readiness",
    name: "Exit-Readiness",
    version: "1.0.0",
    description: "Strukturierte Exit-Readiness-Analyse für KMU. 9 Blöcke, 73 Fragen. Basierend auf Blueprint V3.4.",
  },
  blocks,
  meta: {
    source: "strategaize-blueprint-plattform/scripts/catalog-v1.0.json",
    source_version: catalog.version,
    blueprint_version: catalog.blueprint_version,
    total_blocks: blocks.length,
    total_questions: totalQuestions,
    generated_at: new Date().toISOString(),
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(seed, null, 2), "utf-8");

console.log(`✓ Seed written to ${outputPath}`);
console.log(`  Blocks: ${blocks.length}`);
console.log(`  Questions: ${totalQuestions}`);
for (const b of blocks) {
  console.log(`  Block ${b.key} (${b.title.de}): ${b.questions.length} questions`);
}
