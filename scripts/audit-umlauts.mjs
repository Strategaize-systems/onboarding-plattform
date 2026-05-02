#!/usr/bin/env node
// SLC-052 MT-4 — Audit-Helper fuer Umlaut-Konsistenz.
//
// Scant ausgewaehlte User-facing-Files nach `ae`, `oe`, `ue`, `ss`-Vorkommnissen
// und filtert eine Whitelist aus englischen Worten heraus, die dort gueltig
// bleiben (z.B. "user", "queue", "Business").
//
// Output-Format: `path:line:col — '<context>' (<word>)`. Manuell pro Treffer
// entscheiden, ob das Wort tatsaechlich ein deutsches Wort mit fehlendem Umlaut
// ist oder ein gueltiges englisches Wort.
//
// Aufruf: `npm run audit:umlauts` oder direkt `node scripts/audit-umlauts.mjs`.
//
// Scope (bewusst eng — Code-Identifier-Files werden nicht gescannt):
// - src/messages/de.json
// - data/seed/*.json (alle Templates inkl. Exit-Readiness)
// - sql/migrations/*seed*.sql (Seed-SQL mit Template-Inhalten)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();

// Englische Worte / technische Tokens, die `ae|oe|ue|ss` enthalten und
// gueltig bleiben sollen. Lowercase-Vergleich.
const WHITELIST = new Set([
  // Generic English
  "user", "users", "username",
  "team", "teams", "teammate",
  "queue", "queues", "queued",
  "true", "false",
  "value", "values",
  "issue", "issues", "issued",
  "due", "overdue",
  "type", "types",
  "use", "uses", "used", "useful",
  "release", "releases", "released",
  "process", "processes", "processed", "processing",
  "request", "requests", "requested",
  "response", "responses",
  "interface", "interfaces",
  "create", "creates", "created", "creating",
  "update", "updates", "updated", "updating",
  "delete", "deletes", "deleted", "deleting",
  "feedback",
  "message", "messages", "messaged",
  "metadata",
  "context", "contexts",
  "content", "contents",
  "overview", "overviews",
  "source", "sources", "sourced",
  "target", "targets", "targeted",
  "case", "cases",
  "base", "bases", "based", "baseline",
  "date", "dates",
  "questionnaire", "questionnaires",
  "question", "questions",
  "state", "states",
  "title", "titles", "titled",
  "language", "languages",
  // Domain
  "assessment", "assessments",
  "readiness",
  "blueprint", "blueprints",
  "business",
  "exit",
  "preview", "previews", "previewed",
  // Strategaize-spezifisch
  "strategaize",
  "intelligence",
  "session", "sessions",
  "workspace", "workspaces",
  "snapshot", "snapshots",
  "dashboard", "dashboards",
  "reviews", "reviewer", "reviewers", "reviewed",
  // Common-Suffix in EN
  "showless", "stateless", "useless",
  "course", "courses",
  "force", "forces", "forced",
  "service", "services",
  "office", "offices",
  "voice", "voices",
  "choice", "choices",
  "since",
  "phase", "phases", "phased",
  "phrase", "phrases",
]);

const SUSPECT_RE = /\b[\wÄÖÜäöüß]*?(ae|oe|ue|ss)[\wÄÖÜäöüß]*\b/g;

function isWhitelisted(word) {
  const lower = word.toLowerCase();
  if (WHITELIST.has(lower)) return true;
  // Liberal-Ende-Check: e.g. "questions", "questioned" via root "question".
  for (const w of WHITELIST) {
    if (lower.startsWith(w) && (lower.length - w.length) <= 4) return true;
  }
  return false;
}

function scanFile(absPath) {
  const text = readFileSync(absPath, "utf8");
  const findings = [];
  let match;
  // Reset regex state for each file.
  SUSPECT_RE.lastIndex = 0;
  while ((match = SUSPECT_RE.exec(text)) !== null) {
    const word = match[0];
    if (isWhitelisted(word)) continue;
    const before = text.slice(0, match.index);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    const lastNl = before.lastIndexOf("\n");
    const column = match.index - lastNl;
    const snippetStart = Math.max(0, match.index - 30);
    const snippetEnd = Math.min(text.length, match.index + word.length + 30);
    const snippet = text.slice(snippetStart, snippetEnd).replace(/\n/g, " ");
    findings.push({
      path: relative(REPO_ROOT, absPath).replace(/\\/g, "/"),
      line,
      column,
      word,
      snippet,
    });
  }
  return findings;
}

function collectTargets() {
  const out = [];

  out.push(join(REPO_ROOT, "src/messages/de.json"));

  const seedDir = join(REPO_ROOT, "data/seed");
  try {
    for (const entry of readdirSync(seedDir)) {
      if (entry.endsWith(".json")) out.push(join(seedDir, entry));
    }
  } catch {
    // optional
  }

  const sqlDir = join(REPO_ROOT, "sql/migrations");
  try {
    for (const entry of readdirSync(sqlDir)) {
      if (entry.includes("seed") && entry.endsWith(".sql")) {
        out.push(join(sqlDir, entry));
      }
    }
  } catch {
    // optional
  }

  return out.filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function main() {
  const targets = collectTargets();
  const allFindings = [];
  for (const t of targets) {
    allFindings.push(...scanFile(t));
  }

  if (allFindings.length === 0) {
    console.log("Audit OK — keine verdaechtigen ae/oe/ue/ss-Vorkommnisse in den User-facing Files.");
    return;
  }

  for (const f of allFindings) {
    console.log(`${f.path}:${f.line}:${f.column} — '${f.snippet.trim()}' (${f.word})`);
  }
  console.log(`\nGesamt: ${allFindings.length} Vorkommnis(se) in ${targets.length} Datei(en) gescannt.`);
  console.log("Manuell pruefen — Whitelist im Script erweitern fuer gueltige englische Worte.");
}

main();
