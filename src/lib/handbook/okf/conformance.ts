// SLC-V9.7-B MT-1 — OKF-v0.1-Konformitaets-Check (Strategaize-Profil 1.0).
//
// Validiert ein assembliertes Bundle (`Record<path, content>`) programmatisch
// gegen das OKF-v0.1-Konformitaets-Minimum + das Strategaize-Profil:
//   SC-1  jede Nicht-Reserved-.md hat parsebares Frontmatter + non-empty `type`
//   SC-2  `type` in der registrierten Strategaize-Tabelle
//   SC-3  `strategaize_source` + `strategaize_tenant` gesetzt
//   SC-4  root `index.md` deklariert `okf_version` + `strategaize_okf_profile`
//   SC-5  `log.md` vorhanden + >=1 Eintrag
//
// Reine Funktion (kein I/O). Wird vom Worker NACH `assembleOkfBundle` gerufen;
// `ok=false` loest die weiche Degradation aus (SLC-V9.7-B MT-4, DEC-225).
// Quelle der registrierten `type`-Werte: Rule strategaize-okf-profile.md.

import { parse as parseYaml } from "yaml";

/** Registrierte Strategaize-OKF `type`-Werte (Produkt-Wissen). */
const REGISTERED_TYPES = new Set<string>([
  "finding",
  "risk",
  "action",
  "observation",
  "sop",
  "diagnosis",
  "handbook-section",
]);

/** Reservierte Bundle-Root-Dateien (kein Concept, kein `type`-Zwang). */
const RESERVED_FILES = new Set<string>(["index.md", "log.md"]);

export interface OkfConformanceViolation {
  file: string;
  rule:
    | "frontmatter-parsable"
    | "type-required"
    | "type-registered"
    | "strategaize-fields"
    | "root-index-version"
    | "log-present";
  message: string;
}

export interface OkfConformanceResult {
  ok: boolean;
  violations: OkfConformanceViolation[];
}

// `[\s\S]` statt /s-Flag (tsconfig target < es2018, vgl. emit.ts firstSentence).
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

type FrontmatterParse =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false };

function parseFrontmatter(content: string): FrontmatterParse {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { ok: false };
  }
  try {
    const parsed = parseYaml(match[1]);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

export function checkOkfConformance(
  files: Record<string, string>,
): OkfConformanceResult {
  const violations: OkfConformanceViolation[] = [];

  // SC-4: root index.md vorhanden + Versions-Felder.
  const rootIndex = files["index.md"];
  if (rootIndex === undefined) {
    violations.push({
      file: "index.md",
      rule: "root-index-version",
      message: "root index.md missing",
    });
  } else {
    const fm = parseFrontmatter(rootIndex);
    if (!fm.ok) {
      violations.push({
        file: "index.md",
        rule: "root-index-version",
        message: "root index.md frontmatter not parsable",
      });
    } else {
      if (!hasValue(fm.data.okf_version)) {
        violations.push({
          file: "index.md",
          rule: "root-index-version",
          message: "root index.md missing okf_version",
        });
      }
      if (!hasValue(fm.data.strategaize_okf_profile)) {
        violations.push({
          file: "index.md",
          rule: "root-index-version",
          message: "root index.md missing strategaize_okf_profile",
        });
      }
    }
  }

  // SC-5: log.md vorhanden + >=1 Eintrag (datierte ## Section ODER Bullet).
  const log = files["log.md"];
  if (log === undefined) {
    violations.push({
      file: "log.md",
      rule: "log-present",
      message: "log.md missing",
    });
  } else if (!/^##\s+\S/m.test(log) && !/^\s*[-*]\s+\S/m.test(log)) {
    violations.push({
      file: "log.md",
      rule: "log-present",
      message: "log.md has no entry",
    });
  }

  // SC-1..3: Concept-Dateien (alle .md ausser Reserved).
  for (const [path, content] of Object.entries(files)) {
    if (RESERVED_FILES.has(path)) {
      continue;
    }
    if (!path.endsWith(".md")) {
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm.ok) {
      violations.push({
        file: path,
        rule: "frontmatter-parsable",
        message: "frontmatter not parsable",
      });
      continue;
    }

    const type = fm.data.type;
    if (typeof type !== "string" || type.trim() === "") {
      violations.push({
        file: path,
        rule: "type-required",
        message: "missing or empty type",
      });
    } else if (!REGISTERED_TYPES.has(type)) {
      violations.push({
        file: path,
        rule: "type-registered",
        message: `unregistered type "${type}"`,
      });
    }

    if (!hasValue(fm.data.strategaize_source)) {
      violations.push({
        file: path,
        rule: "strategaize-fields",
        message: "missing strategaize_source",
      });
    }
    if (!hasValue(fm.data.strategaize_tenant)) {
      violations.push({
        file: path,
        rule: "strategaize-fields",
        message: "missing strategaize_tenant",
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
