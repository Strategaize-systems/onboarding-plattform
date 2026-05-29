#!/usr/bin/env node
// SLC-148 MT-1 — Build-time seed generator for the V8 Mandanten-Report template.
//
// Reads ../strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md
// and emits sql/migrations/102_v8_exit_readiness_teaser_template.sql with the
// stufen_lookup + worum_es_geht + hausaufgaben_lookup JSONB payload.
//
// MT-2 extends the generated SQL with the 47-question blocks payload, the
// ALTER TABLE capture_session for released_for_strategaize_review, and the
// strategaize_admin RLS-snapshot-gate.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const DEFAULT_INPUT = resolve(
  repoRoot,
  "../strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md",
);
const DEFAULT_OUTPUT = resolve(
  repoRoot,
  "sql/migrations/102_v8_exit_readiness_teaser_template.sql",
);

export const STUFEN_MODULES = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];
export const STUFEN_KEYS = ["s1", "s2", "s3", "s4", "s5"];
export const HYGIENE_KEYS = ["M0.1", "M0.2", "M0.3", "M0.4", "M0.5"];

export const GEWICHTUNG = {
  m1: 10, m2: 10, m3: 10, m4: 10, m5: 10, m6: 10, m7: 10, m8: 10, m9: 20,
};

export function parseLevelsMandant(markdown) {
  const lines = markdown.split(/\r?\n/);

  const stufen_lookup = {};
  const worum_es_geht = {};
  const hausaufgaben_lookup = {};

  let currentModuleN = null;
  let currentSection = null; // "s1".."s5" | "M0.1".."M0.5" | "worum"
  let currentField = null;   // "was_es_bedeutet" | "unsere_empfehlung" | "antwort_teilweise" | "antwort_nein" | "worum"
  let buffer = [];

  function commit() {
    if (!currentField || currentModuleN === null) {
      buffer = [];
      return;
    }
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text.length === 0) {
      currentField = null;
      return;
    }
    if (currentField === "worum") {
      if (currentModuleN >= 1 && currentModuleN <= 9) {
        worum_es_geht[`m${currentModuleN}`] = text;
      }
    } else if (currentField === "was_es_bedeutet" || currentField === "unsere_empfehlung") {
      const mKey = `m${currentModuleN}`;
      stufen_lookup[mKey] = stufen_lookup[mKey] || {};
      stufen_lookup[mKey][currentSection] = stufen_lookup[mKey][currentSection] || {};
      stufen_lookup[mKey][currentSection][currentField] = text;
    } else if (currentField === "antwort_teilweise" || currentField === "antwort_nein") {
      hausaufgaben_lookup[currentSection] = hausaufgaben_lookup[currentSection] || {};
      const key = currentField === "antwort_teilweise" ? "teilweise" : "nein";
      hausaufgaben_lookup[currentSection][key] = text;
    }
    currentField = null;
  }

  for (const line of lines) {
    const moduleMatch = line.match(/^## Modul (\d+)\s+—\s+/);
    if (moduleMatch) {
      commit();
      currentModuleN = parseInt(moduleMatch[1], 10);
      currentSection = null;
      currentField = null;
      continue;
    }

    if (/^### Worum es geht\s*$/.test(line)) {
      commit();
      currentSection = "worum";
      currentField = "worum";
      continue;
    }

    const stufeMatch = line.match(/^### Stufe (\d+)\s+—\s+/);
    if (stufeMatch) {
      commit();
      currentSection = `s${stufeMatch[1]}`;
      currentField = null;
      continue;
    }

    const hygieneMatch = line.match(/^### (M0\.\d+)\s+—\s+/);
    if (hygieneMatch) {
      commit();
      currentSection = hygieneMatch[1];
      currentField = null;
      continue;
    }

    if (/^\*\*Was es bedeutet:\*\*\s*$/.test(line)) {
      commit();
      currentField = "was_es_bedeutet";
      continue;
    }
    if (/^\*\*Unsere Empfehlung:\*\*\s*$/.test(line)) {
      commit();
      currentField = "unsere_empfehlung";
      continue;
    }
    if (/^\*\*Antwort:\s*Teilweise\s+—\s+Hausaufgabe:\*\*\s*$/.test(line)) {
      commit();
      currentField = "antwort_teilweise";
      continue;
    }
    if (/^\*\*Antwort:\s*Nein\s+—\s+Hausaufgabe:\*\*\s*$/.test(line)) {
      commit();
      currentField = "antwort_nein";
      continue;
    }
    if (/^\*\*Frage:\*\*/.test(line)) {
      // Frage-Text wird in MT-2 aus PRINZIPIEN.md geseeded, hier nicht uebernehmen.
      commit();
      continue;
    }
    if (/^---\s*$/.test(line)) {
      commit();
      continue;
    }
    if (/^>\s/.test(line)) {
      // Blockquote (z.B. Modul-9 Hinweis-Zeile), nicht Teil eines Feldes.
      continue;
    }

    if (currentField) {
      buffer.push(line);
    }
  }
  commit();

  return { stufen_lookup, worum_es_geht, hausaufgaben_lookup };
}

export function validateParseResult(parsed) {
  const errors = [];

  for (const m of STUFEN_MODULES) {
    if (!parsed.worum_es_geht[m] || parsed.worum_es_geht[m].length === 0) {
      errors.push(`worum_es_geht.${m} fehlt oder leer`);
    }
  }

  for (const m of STUFEN_MODULES) {
    const mod = parsed.stufen_lookup[m];
    if (!mod) {
      errors.push(`stufen_lookup.${m} fehlt`);
      continue;
    }
    for (const s of STUFEN_KEYS) {
      const st = mod[s];
      if (!st) {
        errors.push(`stufen_lookup.${m}.${s} fehlt`);
        continue;
      }
      if (!st.was_es_bedeutet) {
        errors.push(`stufen_lookup.${m}.${s}.was_es_bedeutet fehlt`);
      }
      if (!st.unsere_empfehlung) {
        errors.push(`stufen_lookup.${m}.${s}.unsere_empfehlung fehlt`);
      }
    }
  }

  for (const h of HYGIENE_KEYS) {
    const item = parsed.hausaufgaben_lookup[h];
    if (!item) {
      errors.push(`hausaufgaben_lookup.${h} fehlt`);
      continue;
    }
    if (!item.teilweise) {
      errors.push(`hausaufgaben_lookup.${h}.teilweise fehlt`);
    }
    if (!item.nein) {
      errors.push(`hausaufgaben_lookup.${h}.nein fehlt`);
    }
  }

  return errors;
}

function jsonbLiteral(obj) {
  const json = JSON.stringify(obj);
  return `'${json.replace(/'/g, "''")}'::jsonb`;
}

export function buildMigrationSql(parsed) {
  const stufenLookupSql = jsonbLiteral(parsed.stufen_lookup);
  const worumEsGehtSql = jsonbLiteral(parsed.worum_es_geht);
  const hausaufgabenLookupSql = jsonbLiteral(parsed.hausaufgaben_lookup);
  const gewichtungSql = jsonbLiteral(GEWICHTUNG);

  return `-- Migration 102 — V8 Mandanten-Report-Teaser Template
-- Generated by scripts/build-v8-template-seed.mjs (SLC-148 MT-1)
-- Source: ../strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md
--
-- DO NOT EDIT the metadata payload by hand — regenerate via:
--   node scripts/build-v8-template-seed.mjs
--
-- MT-2 extends this file with:
--   * blocks JSONB (47 questions across 11 modules M0..M10)
--   * ALTER TABLE public.capture_session for released_for_strategaize_review
--   * RLS-policy gate for strategaize_admin snapshot access

BEGIN;

INSERT INTO public.template (slug, version, name, description, metadata, blocks)
VALUES (
  'exit-readiness-teaser-v1',
  1,
  'Exit Readiness Teaser (Mandanten-Report)',
  'V8 Mandanten-adressierter Selbstcheck mit deterministischem SUI-Score ueber 11 Module (M0..M10).',
  jsonb_build_object(
    'usage_kind',          'mandanten_report_teaser_v1',
    'scoring_kind',        'sui_weighted',
    'report_renderer',     'mandanten_report_v2',
    'gewichtung',          ${gewichtungSql},
    'stufen_lookup',       ${stufenLookupSql},
    'worum_es_geht',       ${worumEsGehtSql},
    'hausaufgaben_lookup', ${hausaufgabenLookupSql}
  ),
  '[]'::jsonb  -- TODO MT-2: 11 module blocks with 47 questions
)
ON CONFLICT (slug, version) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      metadata    = EXCLUDED.metadata,
      blocks      = EXCLUDED.blocks;

COMMIT;
`;
}

function main() {
  const inputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_INPUT;
  const outputPath = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_OUTPUT;

  console.log(`[build-v8-template-seed] Reading: ${inputPath}`);
  const markdown = readFileSync(inputPath, "utf-8");

  const parsed = parseLevelsMandant(markdown);

  const errors = validateParseResult(parsed);
  if (errors.length > 0) {
    console.error("[build-v8-template-seed] Validierungsfehler:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const sql = buildMigrationSql(parsed);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, sql, "utf-8");

  const m1Stufen = parsed.stufen_lookup.m1 ? Object.keys(parsed.stufen_lookup.m1).length : 0;
  console.log(`[build-v8-template-seed] Wrote: ${outputPath}`);
  console.log(`  stufen_lookup: ${Object.keys(parsed.stufen_lookup).length} Module x ${m1Stufen} Stufen`);
  console.log(`  worum_es_geht: ${Object.keys(parsed.worum_es_geht).length} Module`);
  console.log(`  hausaufgaben_lookup: ${Object.keys(parsed.hausaufgaben_lookup).length} Hygiene-Fragen`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main();
}
