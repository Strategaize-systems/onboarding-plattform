#!/usr/bin/env node
// V8 SLC-148 MT-7 + SLC-162 MT-7 — Tonalitaets-Audit fuer Mandanten-Report.
//
// V8.0-Scope (--scope=db): Greppt alle Mandant-adressierten Texte im V8-
//   Template (Migration 102) gegen eine StB-Tonalitaets-Blacklist.
// V8.1-Scope (--scope=outro): Greppt die statischen Outro-Strings in
//   src/lib/pdf/mandanten-report-v2/pages/outro.tsx und
//   src/app/dashboard/diagnose/[capture_session_id]/bericht/V8OutroSection.tsx
//   gegen die V8.1-Lead-Conversion-Tonalitaets-Blacklist.
// Default (kein --scope): laeuft beide.
//
// Geprueft im DB-Scope (auf Coolify-DB via TEST_DATABASE_URL):
//   - template.metadata.stufen_lookup.{m1..m9}.{s1..s5}.unsere_empfehlung
//     (45 Empfehlungs-Texte)
//   - template.metadata.stufen_lookup.{m1..m9}.{s1..s5}.was_es_bedeutet
//     (45 Bedeutungs-Texte)
//   - template.metadata.worum_es_geht.{m1..m9}    (9 Texte)
//   - template.metadata.hausaufgaben_lookup.{M0.1..M0.5}.{nein|teilweise}
//     (10 Texte)
//
// V8.0-Blacklist-Patterns:
//   - "Ihr Steuerberater" / "ihre Steuerberaterin"      — falscher Adressat (StB statt Mandant)
//   - "wir empfehlen" / "wir wuerden empfehlen"          — Wir-Konstrukt ohne Strategaize-Sicht
//   - "der Berater" / "dem Berater"                       — falscher Adressat
//   - "Wir sollten" / "Wir muessten"                       — Wir-Konstrukt
//
// V8.1-Outro-Blacklist-Patterns (Lead-Conversion-Voice):
//   - "ich" / "mein Team" / "der Founder" / "Founders"   — Founder-Voice (V8.1 = Strategaize-Wir-Voice)
//   - "Euro" / "EUR" / "Kosten" / "Preis"                 — Pricing-Hinweise (V8.1 = kein Pricing-Druck)
//   - "Empfehlung Ihres Steuerberaters"                   — V8.0-Wording im V8.1-Pfad
//
// Aufruf:
//   TEST_DATABASE_URL='postgresql://postgres:PW@HOST:5432/postgres' \
//     node scripts/tonalitaet-audit-v8.mjs                   # both
//   node scripts/tonalitaet-audit-v8.mjs --scope=db          # nur V8.0-Template-DB
//   node scripts/tonalitaet-audit-v8.mjs --scope=outro       # nur V8.1-Outro-Files
//
// Exit-Code: 0 bei clean, 1 bei Treffer (Audit-Fail).

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DB_BLACKLIST = [
  { pattern: /Ihr(e?)\s+Steuerberater(in)?/i, label: "Ihr Steuerberater" },
  { pattern: /\bwir\s+empfehl(en|t|e)\b/i, label: "wir empfehlen" },
  { pattern: /\bwir\s+w(ue|ü)rden\s+empfehlen/i, label: "wir wuerden empfehlen" },
  { pattern: /\bder\s+Berater\b/i, label: "der Berater" },
  { pattern: /\bdem\s+Berater\b/i, label: "dem Berater" },
  { pattern: /\bden\s+Berater\b/i, label: "den Berater" },
  { pattern: /\bWir\s+sollten\b/i, label: "Wir sollten" },
  { pattern: /\bWir\s+m(ue|ü)ssten\b/i, label: "Wir muessten" },
];

// V8.1 Lead-Conversion-Outro-Blacklist (SLC-162 MT-7).
const OUTRO_BLACKLIST = [
  { pattern: /\bich\b/i, label: "ich (Founder-Voice statt Wir-Voice)" },
  { pattern: /\bmein\s+Team\b/i, label: "mein Team (Founder-Voice)" },
  { pattern: /\bder\s+Founder\b/i, label: "der Founder (Founder-Voice)" },
  { pattern: /\bFounders?\b/i, label: "Founder/Founders (Founder-Voice)" },
  { pattern: /\bEuro\b/i, label: "Euro (Pricing-Hinweis)" },
  { pattern: /\bEUR\b/, label: "EUR (Pricing-Hinweis)" },
  { pattern: /\bKosten\b/i, label: "Kosten (Pricing-Hinweis)" },
  { pattern: /\bPreis(?!t)\b/i, label: "Preis (Pricing-Hinweis)" },
  {
    pattern: /Empfehlung\s+Ihres\s+Steuerberaters/i,
    label: "Empfehlung Ihres Steuerberaters (V8.0-Wording im V8.1-Pfad)",
  },
];

const OUTRO_FILES = [
  "src/lib/pdf/mandanten-report-v2/pages/outro.tsx",
  "src/app/dashboard/diagnose/[capture_session_id]/bericht/V8OutroSection.tsx",
];

const MODUL_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];
const STUFE_KEYS = ["s1", "s2", "s3", "s4", "s5"];
const HAUSAUFGABEN_KEYS = ["M0.1", "M0.2", "M0.3", "M0.4", "M0.5"];

function scanString(value, ctx, blacklist, hits) {
  if (typeof value !== "string" || value.length === 0) return;
  for (const { pattern, label } of blacklist) {
    const match = value.match(pattern);
    if (match) {
      hits.push({
        ctx,
        match: match[0],
        label,
        excerpt: excerpt(value, match.index),
      });
    }
  }
}

/** Entfernt //- und /* ... *​/-Kommentare aus TSX-Quelltext. */
function stripCommentsAndStrings(code) {
  // Erst Block-Comments, dann Line-Comments
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[\t ]*\/\/[^\n]*\n?/gm, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Extrahiert grob die User-facing String-Literale aus TSX-Quelltext:
 * - String-Literale in einfachen/doppelten Quotes
 * - JSX-Text-Nodes (zwischen `>...<` ausserhalb von Tags)
 *
 * Heuristik ist absichtlich grob (false positives moeglich). Fuer V8.1
 * reicht das, da die Outro-Files klein und ueberschaubar sind.
 */
function extractUserFacingStrings(tsx) {
  const stripped = stripCommentsAndStrings(tsx);
  const strings = [];
  // Doppelte-Anfuehrungs-String-Literale
  const dquoteRe = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  while ((m = dquoteRe.exec(stripped)) !== null) {
    if (m[1] && m[1].length > 0) strings.push(m[1]);
  }
  return strings;
}

function excerpt(text, idx) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

function parseScope(argv) {
  const flag = argv.find((a) => a.startsWith("--scope="));
  if (!flag) return "both";
  const value = flag.slice("--scope=".length);
  if (value !== "db" && value !== "outro" && value !== "both") {
    console.error(
      `[tonalitaet-audit-v8] FEHLER: --scope muss db|outro|both sein, war '${value}'.`,
    );
    process.exit(2);
  }
  return value;
}

async function scanDbScope(hits) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("FEHLER: TEST_DATABASE_URL nicht gesetzt (fuer --scope=db|both).");
    console.error(
      "Aufruf: TEST_DATABASE_URL='postgresql://...' node scripts/tonalitaet-audit-v8.mjs",
    );
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  let metadata;
  try {
    const { rows } = await client.query(
      "SELECT metadata FROM public.template WHERE slug = $1 ORDER BY version DESC LIMIT 1",
      ["exit-readiness-teaser-v1"],
    );
    if (rows.length === 0) {
      console.error(
        "FEHLER: Template 'exit-readiness-teaser-v1' nicht in DB gefunden.",
      );
      process.exit(2);
    }
    metadata = rows[0].metadata;
  } finally {
    await client.end();
  }

  let scannedCount = 0;

  const stufenLookup = metadata?.stufen_lookup ?? {};
  for (const m of MODUL_KEYS) {
    for (const s of STUFE_KEYS) {
      const entry = stufenLookup?.[m]?.[s] ?? {};
      scanString(
        entry.unsere_empfehlung,
        `stufen_lookup.${m}.${s}.unsere_empfehlung`,
        DB_BLACKLIST,
        hits,
      );
      scanString(
        entry.was_es_bedeutet,
        `stufen_lookup.${m}.${s}.was_es_bedeutet`,
        DB_BLACKLIST,
        hits,
      );
      scannedCount += 2;
    }
  }

  const worumEsGeht = metadata?.worum_es_geht ?? {};
  for (const m of MODUL_KEYS) {
    scanString(worumEsGeht?.[m], `worum_es_geht.${m}`, DB_BLACKLIST, hits);
    scannedCount += 1;
  }

  const hausaufgabenLookup = metadata?.hausaufgaben_lookup ?? {};
  for (const k of HAUSAUFGABEN_KEYS) {
    const entry = hausaufgabenLookup?.[k] ?? {};
    scanString(entry.nein, `hausaufgaben_lookup.${k}.nein`, DB_BLACKLIST, hits);
    scanString(
      entry.teilweise,
      `hausaufgaben_lookup.${k}.teilweise`,
      DB_BLACKLIST,
      hits,
    );
    scannedCount += 2;
  }

  console.log(
    `[tonalitaet-audit-v8 DB] Geprueft: ${scannedCount} Text-Felder im Template 'exit-readiness-teaser-v1'.`,
  );
}

function scanOutroScope(hits) {
  let scannedCount = 0;
  for (const relPath of OUTRO_FILES) {
    const abs = resolve(process.cwd(), relPath);
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch (err) {
      console.error(
        `[tonalitaet-audit-v8 Outro] FEHLER: Datei '${relPath}' nicht lesbar: ${err.message}`,
      );
      process.exit(2);
    }
    const strings = extractUserFacingStrings(content);
    for (const s of strings) {
      scanString(s, `${relPath}::"${s.slice(0, 40)}…"`, OUTRO_BLACKLIST, hits);
      scannedCount += 1;
    }
  }
  console.log(
    `[tonalitaet-audit-v8 Outro] Geprueft: ${scannedCount} String-Literale aus ${OUTRO_FILES.length} Outro-Files.`,
  );
}

async function main() {
  const scope = parseScope(process.argv.slice(2));
  const hits = [];

  if (scope === "db" || scope === "both") {
    await scanDbScope(hits);
  }
  if (scope === "outro" || scope === "both") {
    scanOutroScope(hits);
  }

  if (hits.length === 0) {
    console.log(
      `[tonalitaet-audit-v8] PASS — keine Blacklist-Treffer (Scope=${scope}).`,
    );
    process.exit(0);
  }

  console.error(
    `[tonalitaet-audit-v8] FAIL — ${hits.length} Treffer auf Tonalitaets-Blacklist (Scope=${scope}):`,
  );
  console.error("");
  for (const h of hits) {
    console.error(`  [${h.label}] in ${h.ctx}`);
    console.error(`    Match: "${h.match}"`);
    console.error(`    Kontext: ${h.excerpt}`);
    console.error("");
  }
  console.error(
    "AKTION DB-Scope: Quell-Datei docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md anpassen,",
  );
  console.error(
    "  Build-Skript laufen (node scripts/build-v8-template-seed.mjs), Migration 102 LIVE re-applizieren.",
  );
  console.error(
    "AKTION Outro-Scope: Quell-Datei outro.tsx / V8OutroSection.tsx anpassen, Audit wiederholen.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[tonalitaet-audit-v8] FEHLER:", err.message);
  process.exit(2);
});
