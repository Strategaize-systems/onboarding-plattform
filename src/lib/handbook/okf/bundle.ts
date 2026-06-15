// SLC-V9.7-B MT-2 — OKF-Bundle-Assembly (Strategaize-Profil 1.0).
//
// `OkfConcept[]` -> validierbares Bundle `Record<path, content>`:
//   - Cross-Link-Injektion: pro Concept eine `## Verwandte`-Section mit
//     bundle-root-absoluten Links zu Concepts gleichen `block_key`
//     (R-B-3: kein Block bei nur einem Concept).
//   - `serializeConcept` (aus emit.ts) je Concept -> `<section-key>/<file>.md`.
//   - root `index.md`: Frontmatter `okf_version` + `strategaize_okf_profile`
//     (Reserved-File, kein `type`-Zwang, DEC-221); Body = Section-gruppierte
//     OKF-Bullet-Form.
//   - `log.md`: ein datierter Creation-Eintrag fuer diesen Snapshot.
//
// Reine Funktion, kein I/O. Grounding: ARCHITECTURE.md §"V9.7 Addendum"
// (DEC-220/221/222/225) + Rule strategaize-okf-profile.md.

import { stringify as stringifyYaml } from "yaml";
import { serializeConcept } from "./emit";
import type { OkfConcept } from "./types";

const OKF_VERSION = "0.1";
const STRATEGAIZE_OKF_PROFILE = "1.0";

export interface OkfBundleContext {
  /** Tenant-Anzeigename (Bundle-Titel, kein Personenbezug). */
  tenantName: string;
  /** Generierungs-Zeitpunkt (Datum landet in log.md). */
  generatedAt: Date;
  /** Snapshot-UUID (id8 in log.md). */
  snapshotId: string;
}

/** Gruppiert Concepts nach `blockKey` (Eingabereihenfolge erhalten). */
function groupByBlockKey(concepts: OkfConcept[]): Map<string, OkfConcept[]> {
  const groups = new Map<string, OkfConcept[]>();
  for (const concept of concepts) {
    const arr = groups.get(concept.blockKey) ?? [];
    arr.push(concept);
    groups.set(concept.blockKey, arr);
  }
  return groups;
}

/**
 * Haengt eine `## Verwandte`-Section an den Body, die bundle-root-absolut auf
 * alle ANDEREN Concepts gleichen `block_key` verlinkt. Bei einem alleinstehenden
 * Concept (keine Geschwister) bleibt der Body unveraendert (R-B-3).
 */
function withCrossLinks(
  concept: OkfConcept,
  groups: Map<string, OkfConcept[]>,
): OkfConcept {
  const siblings = (groups.get(concept.blockKey) ?? []).filter(
    (other) => other.path !== concept.path,
  );
  if (siblings.length === 0) {
    return concept;
  }

  const links = siblings
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((other) => `- [${other.frontmatter.title}](/${other.path})`);

  const related = ["## Verwandte", "", ...links].join("\n");
  const trimmedBody = concept.body.trim();
  const body = trimmedBody ? `${trimmedBody}\n\n${related}` : related;
  return { ...concept, body };
}

/** Root `index.md`: Versions-Frontmatter + Section-gruppierte Bullet-Form. */
function buildIndex(concepts: OkfConcept[], ctx: OkfBundleContext): string {
  const frontmatter = stringifyYaml({
    okf_version: OKF_VERSION,
    strategaize_okf_profile: STRATEGAIZE_OKF_PROFILE,
  });

  const lines: string[] = [
    `# OKF Wissens-Bundle — ${ctx.tenantName}`.trimEnd(),
    "",
    "Maschinenlesbares Wissens-Bundle (Google Open Knowledge Format v0.1, Strategaize-Profil 1.0).",
    "",
  ];

  const groups = groupByBlockKey(concepts);
  const sectionKeys = Array.from(groups.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  for (const sectionKey of sectionKeys) {
    const sectionConcepts = (groups.get(sectionKey) ?? [])
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path));
    lines.push(`## ${sectionKey}`, "");
    for (const concept of sectionConcepts) {
      const desc = concept.frontmatter.description?.trim();
      const bullet = desc
        ? `* [${concept.frontmatter.title}](/${concept.path}) - ${desc}`
        : `* [${concept.frontmatter.title}](/${concept.path})`;
      lines.push(bullet);
    }
    lines.push("");
  }

  return `---\n${frontmatter}---\n\n${lines.join("\n").trimEnd()}\n`;
}

/** `log.md`: ein datierter Creation-Eintrag fuer diesen Snapshot. */
function buildLog(conceptCount: number, ctx: OkfBundleContext): string {
  const date = ctx.generatedAt.toISOString().slice(0, 10);
  const id8 = ctx.snapshotId.slice(0, 8);
  return [
    "# Log",
    "",
    `## ${date}`,
    `- Creation: Bundle aus Snapshot ${id8}, ${conceptCount} Concepts`,
    "",
  ].join("\n");
}

/**
 * Assembliert `OkfConcept[]` zu einem OKF-v0.1-konformen Bundle.
 * Reihenfolge: Cross-Links injizieren -> serialisieren -> index.md + log.md.
 */
export function assembleOkfBundle(
  concepts: OkfConcept[],
  ctx: OkfBundleContext,
): Record<string, string> {
  const groups = groupByBlockKey(concepts);
  const files: Record<string, string> = {};

  files["index.md"] = buildIndex(concepts, ctx);
  files["log.md"] = buildLog(concepts.length, ctx);

  for (const concept of concepts) {
    const linked = withCrossLinks(concept, groups);
    const { path, content } = serializeConcept(linked);
    files[path] = content;
  }

  return files;
}
