#!/usr/bin/env node
// V8 SLC-148 MT-7 — Tonalitaets-Audit fuer Mandanten-Report-Teaser-Template.
//
// Greppt alle Mandant-adressierten Texte im V8-Template (Migration 102) gegen
// eine StB-Tonalitaets-Blacklist. Pflicht-Pass vor V8-Release per AC-5.
//
// Geprueft werden (auf Coolify-DB via TEST_DATABASE_URL):
//   - template.metadata.stufen_lookup.{m1..m9}.{s1..s5}.unsere_empfehlung
//     (45 Empfehlungs-Texte)
//   - template.metadata.stufen_lookup.{m1..m9}.{s1..s5}.was_es_bedeutet
//     (45 Bedeutungs-Texte)
//   - template.metadata.worum_es_geht.{m1..m9}    (9 Texte)
//   - template.metadata.hausaufgaben_lookup.{M0.1..M0.5}.{nein|teilweise}
//     (10 Texte)
//
// Blacklist-Patterns:
//   - "Ihr Steuerberater" / "ihre Steuerberaterin"      — falscher Adressat (StB statt Mandant)
//   - "wir empfehlen" / "wir wuerden empfehlen"          — Wir-Konstrukt ohne Strategaize-Sicht
//   - "der Berater" / "dem Berater"                       — falscher Adressat
//   - "Wir sollten" / "Wir muessten"                       — Wir-Konstrukt
//
// Aufruf:
//   TEST_DATABASE_URL='postgresql://postgres:PW@HOST:5432/postgres' \
//     node scripts/tonalitaet-audit-v8.mjs
//
// Exit-Code: 0 bei clean, 1 bei Treffer (Audit-Fail).

import pg from "pg";

const BLACKLIST = [
  { pattern: /Ihr(e?)\s+Steuerberater(in)?/i, label: "Ihr Steuerberater" },
  { pattern: /\bwir\s+empfehl(en|t|e)\b/i, label: "wir empfehlen" },
  { pattern: /\bwir\s+w(ue|ü)rden\s+empfehlen/i, label: "wir wuerden empfehlen" },
  { pattern: /\bder\s+Berater\b/i, label: "der Berater" },
  { pattern: /\bdem\s+Berater\b/i, label: "dem Berater" },
  { pattern: /\bden\s+Berater\b/i, label: "den Berater" },
  { pattern: /\bWir\s+sollten\b/i, label: "Wir sollten" },
  { pattern: /\bWir\s+m(ue|ü)ssten\b/i, label: "Wir muessten" },
];

const MODUL_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];
const STUFE_KEYS = ["s1", "s2", "s3", "s4", "s5"];
const HAUSAUFGABEN_KEYS = ["M0.1", "M0.2", "M0.3", "M0.4", "M0.5"];

function scanString(value, ctx, hits) {
  if (typeof value !== "string" || value.length === 0) return;
  for (const { pattern, label } of BLACKLIST) {
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

function excerpt(text, idx) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("FEHLER: TEST_DATABASE_URL nicht gesetzt.");
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

  const hits = [];
  let scannedCount = 0;

  // Stufen-Lookup (45 unsere_empfehlung + 45 was_es_bedeutet)
  const stufenLookup = metadata?.stufen_lookup ?? {};
  for (const m of MODUL_KEYS) {
    for (const s of STUFE_KEYS) {
      const entry = stufenLookup?.[m]?.[s] ?? {};
      scanString(
        entry.unsere_empfehlung,
        `stufen_lookup.${m}.${s}.unsere_empfehlung`,
        hits,
      );
      scanString(
        entry.was_es_bedeutet,
        `stufen_lookup.${m}.${s}.was_es_bedeutet`,
        hits,
      );
      scannedCount += 2;
    }
  }

  // Worum-es-geht (9 Module-Texte)
  const worumEsGeht = metadata?.worum_es_geht ?? {};
  for (const m of MODUL_KEYS) {
    scanString(worumEsGeht?.[m], `worum_es_geht.${m}`, hits);
    scannedCount += 1;
  }

  // Hausaufgaben-Lookup (5 Fragen x 2 Varianten = 10 Texte)
  const hausaufgabenLookup = metadata?.hausaufgaben_lookup ?? {};
  for (const k of HAUSAUFGABEN_KEYS) {
    const entry = hausaufgabenLookup?.[k] ?? {};
    scanString(entry.nein, `hausaufgaben_lookup.${k}.nein`, hits);
    scanString(entry.teilweise, `hausaufgaben_lookup.${k}.teilweise`, hits);
    scannedCount += 2;
  }

  console.log(
    `[tonalitaet-audit-v8] Geprueft: ${scannedCount} Text-Felder im Template 'exit-readiness-teaser-v1'.`,
  );

  if (hits.length === 0) {
    console.log("[tonalitaet-audit-v8] PASS — keine Blacklist-Treffer.");
    process.exit(0);
  }

  console.error(
    `[tonalitaet-audit-v8] FAIL — ${hits.length} Treffer auf Tonalitaets-Blacklist:`,
  );
  console.error("");
  for (const h of hits) {
    console.error(`  [${h.label}] in ${h.ctx}`);
    console.error(`    Match: "${h.match}"`);
    console.error(`    Kontext: ${h.excerpt}`);
    console.error("");
  }
  console.error(
    "AKTION: Quell-Datei docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md anpassen,",
  );
  console.error(
    "  Build-Skript erneut laufen (node scripts/build-v8-template-seed.mjs),",
  );
  console.error("  Migration 102 LIVE re-applizieren, dann Audit wiederholen.");
  process.exit(1);
}

main().catch((err) => {
  console.error("[tonalitaet-audit-v8] FEHLER:", err.message);
  process.exit(2);
});
