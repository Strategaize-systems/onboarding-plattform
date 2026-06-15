// SLC-V9.7-A — OKF Concept-Emitter (Strategaize OKF-Profil 1.0).
//
// Reine, deterministische Pure-Functions: jede kuratierte Wissens-Row
// (knowledge_unit / block_diagnosis / sop) -> ein strukturiertes OkfConcept,
// serialisierbar zu einer `.md`-Datei (Frontmatter-YAML + Body).
//
// Isolation (AC-A-6): keine Worker-/DB-Imports. Erlaubt sind nur `yaml`
// (Frontmatter-Serialisierung, bereits Dependency) und der bestehende
// `slugifyHeading`-Lib-Helper. Cross-Links + Bundle leben in SLC-V9.7-B.
//
// Grounding: docs/ARCHITECTURE.md §"V9.7 Architecture Addendum" + DEC-220..225.

import { stringify as stringifyYaml } from "yaml";
import { slugifyHeading } from "../slugify";
import type {
  DiagnosisInput,
  DiagnosisSubtopicInput,
  KnowledgeUnitInput,
  OkfConcept,
  OkfConfidence,
  OkfCurationStatus,
  OkfEmitContext,
  OkfFrontmatter,
  OkfType,
  SerializedConcept,
  SopInput,
  SopStepInput,
} from "./types";

// --- MT-1: Mapper + Serializer + Pfad-Helper ---

/**
 * Mappt `knowledge_unit.unit_type` auf einen OKF-`type`. finding/risk/action/
 * observation sind 1:1; `ai_draft` -> `observation` (DEC-224); alles andere ist
 * ein harter Fehler (Drift-Schutz, vom Worker weich abgefangen, SLC-V9.7-B).
 */
export function mapUnitTypeToOkf(unitType: string): OkfType {
  switch (unitType) {
    case "finding":
    case "risk":
    case "action":
    case "observation":
      return unitType;
    case "ai_draft":
      return "observation";
    default:
      throw new Error(`mapUnitTypeToOkf: unknown unit_type "${unitType}"`);
  }
}

/**
 * Passthrough der text-Enum-Konfidenz (low/medium/high). KEIN numeric-Mapping
 * — OP fuehrt `confidence` als text-Enum (DEC-224). Unerwartete Werte sind ein
 * harter Fehler.
 */
export function mapConfidence(text: string): OkfConfidence {
  if (text === "low" || text === "medium" || text === "high") {
    return text;
  }
  throw new Error(
    `mapConfidence: unexpected confidence "${text}" (expected low/medium/high, no numeric mapping — DEC-224)`,
  );
}

/** Passthrough des Kuratierungs-Status (proposed/accepted/edited, 1:1). */
export function mapCurationStatus(status: string): OkfCurationStatus {
  if (status === "proposed" || status === "accepted" || status === "edited") {
    return status;
  }
  throw new Error(`mapCurationStatus: unexpected status "${status}"`);
}

/**
 * Erster Satz eines Bodys fuer `description`. Faellt auf `fallback` (i.d.R. den
 * Titel) zurueck, wenn der Body leer ist; ohne Satz-Terminator wird die erste
 * Zeile genommen (R-A-1).
 */
export function firstSentence(body: string, fallback: string): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) {
    return fallback;
  }
  // No dotAll flag (tsconfig target < es2018): `.` stops at newlines, so a body
  // without a terminator on its first line falls back to that first line.
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  const candidate = match ? match[0] : trimmed.split("\n")[0];
  return candidate.trim() || fallback;
}

// Kanonische, deterministische Frontmatter-Key-Reihenfolge (Profil 1.0).
const FRONTMATTER_KEY_ORDER: (keyof OkfFrontmatter)[] = [
  "type",
  "title",
  "description",
  "timestamp",
  "strategaize_source",
  "strategaize_tenant",
  "confidence",
  "curation_status",
  "evidence_count",
  "strategaize_id",
];

/**
 * Serialisiert Frontmatter zu YAML mit deterministischer Key-Reihenfolge.
 * `undefined`-Felder werden weggelassen. Endet (yaml-typisch) mit `\n`.
 */
export function serializeFrontmatter(fm: OkfFrontmatter): string {
  const ordered: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    const value = fm[key];
    if (value !== undefined) {
      ordered[key] = value;
    }
  }
  return stringifyYaml(ordered);
}

/** Deterministischer Dateiname `<type>-<slug(title)>-<id8>.md`. */
export function conceptFilename(
  type: OkfType,
  title: string,
  id: string,
): string {
  return `${type}-${slugifyHeading(title)}-${id.slice(0, 8)}.md`;
}

/** Serialisiert ein Concept zu `{path, content}` (Frontmatter-Fence + Body). */
export function serializeConcept(concept: OkfConcept): SerializedConcept {
  const frontmatter = serializeFrontmatter(concept.frontmatter);
  const body = concept.body.trim();
  return {
    path: concept.path,
    content: `---\n${frontmatter}---\n\n${body}\n`,
  };
}

// --- MT-2: emitKnowledgeUnitConcept ---

/**
 * `knowledge_unit`-Row -> OkfConcept. `evidence_refs` werden NUR gezaehlt — ihr
 * PII-Inhalt landet NIE im Output (DEC-223, DSGVO). KEIN `tags` (DEC-224).
 */
export function emitKnowledgeUnitConcept(
  row: KnowledgeUnitInput,
  ctx: OkfEmitContext,
): OkfConcept {
  const type = mapUnitTypeToOkf(row.unit_type);
  const evidenceCount = Array.isArray(row.evidence_refs)
    ? row.evidence_refs.length
    : 0;

  const frontmatter: OkfFrontmatter = {
    type,
    title: row.title,
    description: firstSentence(row.body, row.title),
    timestamp: row.updated_at,
    strategaize_source: "op",
    strategaize_tenant: ctx.tenantId,
    confidence: mapConfidence(row.confidence),
    curation_status: mapCurationStatus(row.status),
    evidence_count: evidenceCount,
    strategaize_id: row.id,
  };

  return {
    type,
    frontmatter,
    body: row.body,
    blockKey: row.block_key,
    sourceTable: "knowledge_unit",
    sectionKey: row.block_key,
    path: `${row.block_key}/${conceptFilename(type, row.title, row.id)}`,
  };
}

// --- MT-3: emitDiagnosisConcept ---

function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderDiagnosisBody(subtopics: DiagnosisSubtopicInput[]): string {
  return subtopics
    .map((subtopic) => {
      const fields = subtopic.fields ?? {};
      const lines = Object.entries(fields).map(
        ([key, value]) => `- **${key}:** ${renderFieldValue(value)}`,
      );
      return [`## ${subtopic.name}`, "", ...lines].join("\n").trimEnd();
    })
    .join("\n\n");
}

/**
 * `block_diagnosis`-Row -> EIN OkfConcept (DEC-222). Subtopics werden als
 * `## <name>`-Subsections mit Feld-Bullet-Listen in den Body gerendert. Kein
 * `confidence` (Spalte fehlt); `curation_status: accepted` (nur `confirmed`-
 * Diagnosen werden vom Worker uebergeben, SLC-V9.7-B).
 */
export function emitDiagnosisConcept(
  row: DiagnosisInput,
  ctx: OkfEmitContext,
): OkfConcept {
  const blockKey = row.content.block_key ?? row.block_key;
  const title = `Diagnose: ${blockKey}`;
  const subtopics = row.content.subtopics ?? [];

  const frontmatter: OkfFrontmatter = {
    type: "diagnosis",
    title,
    timestamp: row.updated_at,
    strategaize_source: "op",
    strategaize_tenant: ctx.tenantId,
    curation_status: "accepted",
    strategaize_id: row.id,
  };

  return {
    type: "diagnosis",
    frontmatter,
    body: renderDiagnosisBody(subtopics),
    blockKey: row.block_key,
    sourceTable: "block_diagnosis",
    sectionKey: row.block_key,
    path: `${row.block_key}/${conceptFilename("diagnosis", title, row.id)}`,
  };
}

// --- MT-4: emitSopConcept ---

// Renderer bevorzugt das Generator-Feld `action` vor dem Legacy-Feld `title`.
function renderSopStep(step: SopStepInput, index: number): string {
  const headline = step.action ?? step.title ?? "";
  const lines = [`${index + 1}. ${headline}`.trimEnd()];
  if (step.responsible) {
    lines.push(`   - Verantwortlich: ${step.responsible}`);
  }
  if (step.timeframe) {
    lines.push(`   - Zeitrahmen: ${step.timeframe}`);
  }
  if (step.success_criterion) {
    lines.push(`   - Erfolgskriterium: ${step.success_criterion}`);
  }
  if (step.detail) {
    lines.push(`   - ${step.detail}`);
  }
  return lines.join("\n");
}

function renderSopBody(
  objective: string | undefined,
  steps: SopStepInput[],
): string {
  const parts: string[] = [];
  if (objective && objective.trim()) {
    parts.push(objective.trim());
  }
  if (steps.length > 0) {
    parts.push(
      ["## Schritte", "", ...steps.map((step, i) => renderSopStep(step, i))].join(
        "\n",
      ),
    );
  }
  return parts.join("\n\n");
}

/**
 * `sop`-Row -> OkfConcept. Body = Objective + nummerierte Schritte (beide
 * Step-Formate, siehe `workers/handbook/types.ts`). Kein confidence/
 * curation_status (SOP hat keinen Status).
 */
export function emitSopConcept(row: SopInput, ctx: OkfEmitContext): OkfConcept {
  const title = row.content.title ?? `SOP: ${row.block_key}`;
  const objective = row.content.objective;
  const steps = row.content.steps ?? [];

  const frontmatter: OkfFrontmatter = {
    type: "sop",
    title,
    ...(objective ? { description: objective } : {}),
    timestamp: row.updated_at,
    strategaize_source: "op",
    strategaize_tenant: ctx.tenantId,
    strategaize_id: row.id,
  };

  return {
    type: "sop",
    frontmatter,
    body: renderSopBody(objective, steps),
    blockKey: row.block_key,
    sourceTable: "sop",
    sectionKey: row.block_key,
    path: `${row.block_key}/${conceptFilename("sop", title, row.id)}`,
  };
}
