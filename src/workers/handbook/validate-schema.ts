// SLC-039 MT-2 — Validator fuer template.handbook_schema (DEC-038)
//
// Prueft Struktur eines Schemas vor dem Render-Lauf. Failt fruehzeitig mit klarer
// Fehlermeldung bei unvollstaendigen oder unbekannten Sektionen, damit der Worker
// nicht halb-rendert und kein invalides ZIP produziert.

import type {
  HandbookSchema,
  HandbookSection,
  SchemaValidationError,
  SectionSource,
  SubsectionsBy,
} from "./types";

const ALLOWED_SOURCE_TYPES = new Set(["knowledge_unit", "diagnosis", "sop"]);
const ALLOWED_SUBSECTIONS_BY: ReadonlySet<SubsectionsBy> = new Set([
  "subtopic",
  "block_key",
] as const);

export class HandbookSchemaInvalidError extends Error {
  errors: SchemaValidationError[];

  constructor(errors: SchemaValidationError[]) {
    super(
      `handbook_schema invalid: ${errors
        .map((e) => `[${e.path}] ${e.message}`)
        .join("; ")}`,
    );
    this.name = "HandbookSchemaInvalidError";
    this.errors = errors;
  }
}

/**
 * Validiert ein eingehendes JSONB-Objekt als HandbookSchema.
 * Wirft HandbookSchemaInvalidError bei Fehlern, sonst liefert das typed Schema zurueck.
 */
export function validateHandbookSchema(input: unknown): HandbookSchema {
  const errors: SchemaValidationError[] = [];

  if (!isPlainObject(input)) {
    throw new HandbookSchemaInvalidError([
      { path: "$", message: "schema must be a JSON object" },
    ]);
  }

  const root = input as Record<string, unknown>;
  const sectionsRaw = root.sections;
  if (!Array.isArray(sectionsRaw)) {
    errors.push({
      path: "sections",
      message: "must be an array",
    });
    throw new HandbookSchemaInvalidError(errors);
  }
  if (sectionsRaw.length === 0) {
    errors.push({
      path: "sections",
      message: "must contain at least one section",
    });
  }

  const seenKeys = new Set<string>();
  const sections: HandbookSection[] = [];

  sectionsRaw.forEach((rawSection, idx) => {
    const path = `sections[${idx}]`;
    if (!isPlainObject(rawSection)) {
      errors.push({ path, message: "section must be a JSON object" });
      return;
    }
    const section = rawSection as Record<string, unknown>;

    const key = section.key;
    if (typeof key !== "string" || key.trim().length === 0) {
      errors.push({ path: `${path}.key`, message: "must be a non-empty string" });
    } else if (seenKeys.has(key)) {
      errors.push({ path: `${path}.key`, message: `duplicate key '${key}'` });
    } else {
      seenKeys.add(key);
    }

    const title = section.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      errors.push({ path: `${path}.title`, message: "must be a non-empty string" });
    }

    const order = section.order;
    if (typeof order !== "number" || !Number.isFinite(order)) {
      errors.push({ path: `${path}.order`, message: "must be a finite number" });
    }

    const sources = section.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      errors.push({ path: `${path}.sources`, message: "must be a non-empty array" });
    }

    const validatedSources: SectionSource[] = [];
    if (Array.isArray(sources)) {
      sources.forEach((rawSource, sIdx) => {
        const sPath = `${path}.sources[${sIdx}]`;
        if (!isPlainObject(rawSource)) {
          errors.push({ path: sPath, message: "source must be a JSON object" });
          return;
        }
        const source = rawSource as Record<string, unknown>;
        const type = source.type;
        if (typeof type !== "string" || !ALLOWED_SOURCE_TYPES.has(type)) {
          errors.push({
            path: `${sPath}.type`,
            message: `must be one of ${[...ALLOWED_SOURCE_TYPES].join(", ")}`,
          });
        }
        const filter = source.filter;
        if (filter !== undefined && filter !== null && !isPlainObject(filter)) {
          errors.push({
            path: `${sPath}.filter`,
            message: "must be a JSON object when provided",
          });
        }
        if (typeof type === "string" && ALLOWED_SOURCE_TYPES.has(type)) {
          validatedSources.push({
            type: type as SectionSource["type"],
            filter: (filter ?? {}) as SectionSource["filter"],
          });
        }
      });
    }

    const renderRaw = section.render;
    if (!isPlainObject(renderRaw)) {
      errors.push({ path: `${path}.render`, message: "must be a JSON object" });
    }
    let subsectionsBy: SubsectionsBy = "block_key";
    let introTemplate: string | null = null;
    if (isPlainObject(renderRaw)) {
      const render = renderRaw as Record<string, unknown>;
      const sb = render.subsections_by;
      if (typeof sb !== "string" || !ALLOWED_SUBSECTIONS_BY.has(sb as SubsectionsBy)) {
        errors.push({
          path: `${path}.render.subsections_by`,
          message: `must be one of ${[...ALLOWED_SUBSECTIONS_BY].join(", ")}`,
        });
      } else {
        subsectionsBy = sb as SubsectionsBy;
      }
      const intro = render.intro_template;
      if (intro !== undefined && intro !== null && typeof intro !== "string") {
        errors.push({
          path: `${path}.render.intro_template`,
          message: "must be a string when provided",
        });
      } else if (typeof intro === "string") {
        introTemplate = intro;
      }
    }

    if (typeof key === "string" && typeof title === "string" && typeof order === "number") {
      sections.push({
        key,
        title,
        order,
        sources: validatedSources,
        render: { subsections_by: subsectionsBy, intro_template: introTemplate },
      });
    }
  });

  // cross_links sind optional, aber wenn vorhanden muss Struktur stimmen
  const crossLinksRaw = root.cross_links;
  const crossLinks: HandbookSchema["cross_links"] = [];
  if (crossLinksRaw !== undefined) {
    if (!Array.isArray(crossLinksRaw)) {
      errors.push({ path: "cross_links", message: "must be an array when provided" });
    } else {
      crossLinksRaw.forEach((rawLink, idx) => {
        const lPath = `cross_links[${idx}]`;
        if (!isPlainObject(rawLink)) {
          errors.push({ path: lPath, message: "must be a JSON object" });
          return;
        }
        const link = rawLink as Record<string, unknown>;
        const from = link.from_section;
        const to = link.to_section;
        const anchor = link.anchor_match;
        if (typeof from !== "string" || from.length === 0) {
          errors.push({ path: `${lPath}.from_section`, message: "must be a non-empty string" });
        }
        if (typeof to !== "string" || to.length === 0) {
          errors.push({ path: `${lPath}.to_section`, message: "must be a non-empty string" });
        }
        if (typeof anchor !== "string" || anchor.length === 0) {
          errors.push({ path: `${lPath}.anchor_match`, message: "must be a non-empty string" });
        }
        if (
          typeof from === "string" &&
          typeof to === "string" &&
          typeof anchor === "string"
        ) {
          crossLinks!.push({ from_section: from, to_section: to, anchor_match: anchor });
        }
      });
    }
  }

  // Cross-Link-Referenz auf vorhandene Sections
  if (crossLinks && sections.length > 0) {
    const knownKeys = new Set(sections.map((s) => s.key));
    crossLinks.forEach((link, idx) => {
      if (!knownKeys.has(link.from_section)) {
        errors.push({
          path: `cross_links[${idx}].from_section`,
          message: `references unknown section '${link.from_section}'`,
        });
      }
      if (!knownKeys.has(link.to_section)) {
        errors.push({
          path: `cross_links[${idx}].to_section`,
          message: `references unknown section '${link.to_section}'`,
        });
      }
    });
  }

  if (errors.length > 0) {
    throw new HandbookSchemaInvalidError(errors);
  }

  return { sections, cross_links: crossLinks };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
