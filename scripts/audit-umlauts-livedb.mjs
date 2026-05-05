#!/usr/bin/env node
// SLC-062 MT-1 — Audit-Helper fuer Live-DB-JSONB-Dumps.
//
// Scant /tmp/v44-audit/blocks.txt + /tmp/v44-audit/sop.txt (oder die per ENV
// uebergebenen Files) nach `ae|oe|ue|ss`-Vorkommnissen, filtert die Whitelist
// aus audit-umlauts.mjs und gibt Unique-Worte mit Counts aus.
//
// Aufruf:
//   node scripts/audit-umlauts-livedb.mjs
//   AUDIT_FILES=/tmp/v44-audit/blocks.txt,/tmp/v44-audit/sop.txt node scripts/audit-umlauts-livedb.mjs

import { readFileSync } from "node:fs";

const WHITELIST = new Set([
  "user", "users", "username", "team", "teams", "teammate",
  "queue", "queues", "queued", "true", "false", "value", "values",
  "issue", "issues", "issued", "due", "overdue", "type", "types",
  "use", "uses", "used", "useful", "release", "releases", "released",
  "process", "processes", "processed", "processing",
  "request", "requests", "requested", "response", "responses",
  "interface", "interfaces", "create", "creates", "created", "creating",
  "update", "updates", "updated", "updating", "delete", "deletes", "deleted", "deleting",
  "feedback", "message", "messages", "messaged", "metadata",
  "context", "contexts", "content", "contents", "overview", "overviews",
  "source", "sources", "sourced", "target", "targets", "targeted",
  "case", "cases", "base", "bases", "based", "baseline",
  "date", "dates", "questionnaire", "questionnaires", "question", "questions",
  "state", "states", "title", "titles", "titled", "language", "languages",
  "assessment", "assessments", "readiness", "blueprint", "blueprints",
  "business", "exit", "preview", "previews", "previewed",
  "strategaize", "intelligence", "session", "sessions",
  "workspace", "workspaces", "snapshot", "snapshots",
  "dashboard", "dashboards", "reviews", "reviewer", "reviewers", "reviewed",
  "showless", "stateless", "useless", "course", "courses",
  "force", "forces", "forced", "service", "services",
  "office", "offices", "voice", "voices", "choice", "choices",
  "since", "phase", "phases", "phased", "phrase", "phrases",
]);

const SUSPECT_RE = /\b[\wÄÖÜäöüß]*?(ae|oe|ue|ss)[\wÄÖÜäöüß]*\b/g;

function isWhitelisted(word) {
  const lower = word.toLowerCase();
  if (WHITELIST.has(lower)) return true;
  for (const w of WHITELIST) {
    if (lower.startsWith(w) && (lower.length - w.length) <= 4) return true;
  }
  return false;
}

const files = (process.env.AUDIT_FILES ??
  "/tmp/v44-audit/blocks.txt,/tmp/v44-audit/sop.txt").split(",");

const counts = new Map();
let total = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  let match;
  SUSPECT_RE.lastIndex = 0;
  while ((match = SUSPECT_RE.exec(text)) !== null) {
    const word = match[0];
    if (isWhitelisted(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    total++;
  }
}

const sorted = Array.from(counts.entries()).sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
);

console.log(`Unique suspect words: ${counts.size}, total occurrences: ${total}`);
console.log("---");
for (const [word, count] of sorted) {
  console.log(`${count.toString().padStart(4)}  ${word}`);
}
