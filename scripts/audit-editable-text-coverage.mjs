#!/usr/bin/env node
// V7.1 SLC-137 MT-3 — Audit-Skript fuer EditableText-Coverage im Diagnose-Funnel.
//
// Sucht User-facing Strings im Diagnose-Funnel-Pfad und vergleicht mit
// <EditableText>- + resolveText-Aufrufen. Ziel: Coverage-AC fuer FEAT-056
// + SLC-137-Verifikation (>= 50 EditableText-Aufrufe, 0 Hardcodes in Scope).
//
// Heuristik:
//   - Sucht JSX-Textknoten (Text zwischen >...<) und String-Literals mit
//     mind. 5 Buchstaben oder Whitespace.
//   - Filtert offensichtliche Klassen / Pfade / URLs / camelCase-Identifier
//     heraus (keine User-Strings).
//   - Zaehlt im selben Scope `<EditableText` + `resolveText(`-Aufrufe als
//     "migriert".
//
// Aufruf:
//   node scripts/audit-editable-text-coverage.mjs            # Tabellen-Output
//   node scripts/audit-editable-text-coverage.mjs --strict   # Exit-1 wenn Hardcodes
//
// Scope (Diagnose-Funnel-Pfad):
//   - src/app/dashboard/diagnose/**
//   - src/components/diagnose/**
//   - src/lib/email.ts (Email-Templates, MT-6 — Server-side resolveText)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const SCOPES = [
  "src/app/dashboard/diagnose",
  "src/components/diagnose",
  "src/lib/email.ts",
];

const ALLOWED_EXT = new Set([".ts", ".tsx", ".mjs"]);

/**
 * Strings die wir NICHT als Hardcode-Befund werten:
 *  - Tailwind-Klassen-Patterns
 *  - Pfade + URLs
 *  - DB-Spalten / Enums / camelCase-Variablen / SQL-Schluesselworte
 *  - HTML/Image/Type-Attribute-Werte
 *  - Test-Snapshot-Strings (heuristisch: nur grosse Tests)
 */
const STRING_BLOCKLIST_PATTERNS = [
  /^[a-z0-9_-]+$/i,                       // single-word identifier
  /^[a-z]+(-[a-z]+)+$/i,                  // tailwind-class-like
  /^[A-Z_][A-Z0-9_]+$/,                   // CONST_CASE
  /^[\w-]+\/[\w./-]+$/,                   // path/like
  /^\/[\w-]+/,                            // route /path
  /^https?:\/\//,                         // url
  /^[a-z]+:[a-z]/i,                       // type:value
  /^\d/,                                  // starts with digit
  /^\s*$/,                                // whitespace only
  /^[A-Za-z_$][A-Za-z0-9_$]*$/,           // single identifier
  /^(de|en|nl)$/,                         // locale codes
  /^(.|\\n|\\t|\\r)$/,                    // single char or escapes
];

const HARDCODE_MIN_LEN = 4;

function walk(dir, files = []) {
  const stat = statSync(dir);
  if (stat.isFile()) {
    if (ALLOWED_EXT.has(extname(dir))) files.push(dir);
    return files;
  }
  if (!stat.isDirectory()) return files;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry === "__tests__" || entry === "node_modules" || entry.startsWith(".")) {
      continue;
    }
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (ALLOWED_EXT.has(extname(full))) files.push(full);
  }
  return files;
}

function collectFiles() {
  const collected = new Set();
  for (const scope of SCOPES) {
    const abs = resolve(ROOT, scope);
    try {
      walk(abs).forEach((f) => collected.add(f));
    } catch {
      // scope existiert nicht — ueberspringen, kein Fehler
    }
  }
  return [...collected];
}

function isLikelyHardcode(str) {
  if (str.length < HARDCODE_MIN_LEN) return false;
  if (!/[a-zA-ZäöüÄÖÜß]/.test(str)) return false; // mindestens ein Buchstabe
  if (!/\s|[.,;:!?]|[a-z][A-Z]|[äöüÄÖÜß]/.test(str)) {
    // Kein Whitespace, keine Satzzeichen, kein Mixed-Case, keine Umlaute -> wohl Code/Identifier
    if (str.length < 20) return false;
  }
  for (const pat of STRING_BLOCKLIST_PATTERNS) {
    if (pat.test(str)) return false;
  }
  // CSS-Klassen-Listen ausschliessen (mehrere Worte mit Tailwind-Patterns)
  if (/^[a-z0-9:/[\]()-]+(\s+[a-z0-9:/[\]()-]+)+$/i.test(str)) return false;
  // Supabase select() Spalten-Listen ("id, tenant_id, role")
  if (/^[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)+$/i.test(str)) return false;
  // Browser-Tab-Titel (Format "Foo | Bar") — werden ueber metadata gesetzt,
  // nicht user-edit-relevant in V7.1.
  if (/\|/.test(str) && /Strategaize/i.test(str)) return false;
  return true;
}

// JSX-Text zwischen >...<. Erlaubt Leerraeume/Newlines davor und danach,
// aber Inhalt darf keine `<>{}`-Zeichen enthalten (sonst spannt es ueber
// ganze Blocks). Nach Capture wird whitespace getrimmt+kollabiert.
const JSX_TEXT_RE = />([^<>{}]{5,})</g;
// Double-quoted Strings auf einer Zeile (i18n + JSX-Attribute).
const STRING_LITERAL_RE = /"([^"\\\n]{5,}(?:\\[^\n][^"\\\n]*)*)"/g;
// Template-Literals werden in diesem Codebase v.a. fuer code interpolation und
// CSS-Klassen genutzt — wir ueberspringen sie, weil ihre Hardcode-Trefferquote
// zu niedrig fuer die Lesbarkeit des Reports waere. Echte Email-Subject/Body-
// Strings sind ohnehin via `resolveText` zu migrieren — die Count-Spalte zeigt
// das.
const EDITABLE_TEXT_RE = /<EditableText\b/g;
const RESOLVE_TEXT_RE = /\bresolveText\s*\(/g;

// Bereiche im Code, in denen wir Strings ignorieren (i18n-Keys, CSS-Klassen):
function stripIgnoredSpans(text) {
  return text
    // className="..."
    .replace(/className\s*=\s*"[^"\n]*"/g, "")
    // className={cn(...)} oder className={\`...\`}
    .replace(/className\s*=\s*\{[\s\S]*?\}/g, "")
    // cn("...", "...")
    .replace(/\bcn\s*\([^)]*\)/g, "")
    // useTranslations("path"), t("key")
    .replace(/\b(useTranslations|t)\s*\(\s*"[^"]*"\s*\)/g, "")
    // import { ... } from "..."
    .replace(/\bfrom\s+"[^"]*"/g, "")
    .replace(/\bimport\s*\(\s*"[^"]*"\s*\)/g, "")
    // style="..."
    .replace(/style\s*=\s*"[^"\n]*"/g, "")
    // EditableText / resolveText Argumente (defaultText, keyPath, scope)
    .replace(/<EditableText\b[\s\S]*?\/>/g, "")
    .replace(/<EditableText\b[\s\S]*?<\/EditableText>/g, "")
    .replace(/\bresolveText\s*\([^)]*\)/g, "")
    // aria-label="..."
    .replace(/aria-label\s*=\s*"[^"\n]*"/g, "")
    .replace(/data-[\w-]+\s*=\s*"[^"\n]*"/g, "")
    // single-line + multi-line comments
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function scanFile(path) {
  const raw = readFileSync(path, "utf8");
  const editableCount = (raw.match(EDITABLE_TEXT_RE) ?? []).length;
  const resolveCount = (raw.match(RESOLVE_TEXT_RE) ?? []).length;

  const text = stripIgnoredSpans(raw);

  const hardcodes = new Set();
  for (const re of [JSX_TEXT_RE, STRING_LITERAL_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = m[1].replace(/\s+/g, " ").trim();
      if (isLikelyHardcode(s)) hardcodes.add(s);
    }
  }
  return {
    path: relative(ROOT, path).replace(/\\/g, "/"),
    editableCount,
    resolveCount,
    hardcodes: [...hardcodes],
  };
}

function fmt(n, w) {
  return String(n).padStart(w, " ");
}

function main() {
  const files = collectFiles();
  const results = files.map(scanFile);
  let totalEditable = 0;
  let totalResolve = 0;
  let totalHardcodes = 0;

  console.log("");
  console.log("EditableText-Coverage Audit (SLC-137 / FEAT-056)");
  console.log("=".repeat(80));
  console.log(
    `${"File".padEnd(54)} ${"Editable".padStart(8)} ${"Resolve".padStart(8)} ${"Hardcode".padStart(8)}`,
  );
  console.log("-".repeat(80));

  const offenders = [];
  for (const r of results) {
    totalEditable += r.editableCount;
    totalResolve += r.resolveCount;
    totalHardcodes += r.hardcodes.length;
    if (r.editableCount === 0 && r.resolveCount === 0 && r.hardcodes.length === 0) continue;
    console.log(
      `${r.path.padEnd(54).slice(0, 54)} ${fmt(r.editableCount, 8)} ${fmt(r.resolveCount, 8)} ${fmt(r.hardcodes.length, 8)}`,
    );
    if (r.hardcodes.length > 0) {
      offenders.push(r);
    }
  }

  console.log("-".repeat(80));
  console.log(
    `${"TOTAL".padEnd(54)} ${fmt(totalEditable, 8)} ${fmt(totalResolve, 8)} ${fmt(totalHardcodes, 8)}`,
  );
  console.log("");

  if (offenders.length > 0) {
    console.log("Hardcode-Verdacht (heuristisch, manuell pruefen):");
    console.log("-".repeat(80));
    for (const r of offenders) {
      console.log(`\n  ${r.path}`);
      for (const s of r.hardcodes) {
        const trimmed = s.length > 100 ? s.slice(0, 100) + "..." : s;
        console.log(`    - ${trimmed.replace(/\n/g, " / ")}`);
      }
    }
    console.log("");
  }

  console.log(
    `Result: ${totalEditable} EditableText + ${totalResolve} resolveText, ${totalHardcodes} Hardcode-Verdacht.`,
  );

  if (STRICT && totalHardcodes > 0) {
    console.error(`\nSTRICT-Mode: ${totalHardcodes} Hardcodes uebrig — exit 1.`);
    process.exit(1);
  }
  if (totalEditable + totalResolve < 50) {
    console.warn(
      `\nWARN: AC-SLC-137-1 verlangt >= 50 EditableText+resolveText, aktuell ${totalEditable + totalResolve}.`,
    );
  }
}

main();
