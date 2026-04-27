// SLC-039 MT-2 — Tests fuer Handbuch-Schema-Validator

import { describe, expect, it } from "vitest";
import {
  HandbookSchemaInvalidError,
  validateHandbookSchema,
} from "../validate-schema";

const validSchema = {
  sections: [
    {
      key: "geschaeftsmodell_und_markt",
      title: "Geschaeftsmodell & Markt",
      order: 1,
      sources: [
        {
          type: "knowledge_unit",
          filter: { block_keys: ["A"], exclude_source: ["employee_questionnaire"] },
        },
        { type: "diagnosis", filter: { block_keys: ["A"], min_status: "confirmed" } },
        { type: "sop", filter: { block_keys: ["A"] } },
      ],
      render: {
        subsections_by: "subtopic",
        intro_template: "Dieser Abschnitt beschreibt das Geschaeftsmodell.",
      },
    },
    {
      key: "operatives_tagesgeschaeft",
      title: "Operatives Tagesgeschaeft",
      order: 5,
      sources: [
        {
          type: "knowledge_unit",
          filter: { source_in: ["employee_questionnaire"] },
        },
      ],
      render: { subsections_by: "block_key", intro_template: "Sicht der Mitarbeiter." },
    },
  ],
  cross_links: [
    {
      from_section: "operatives_tagesgeschaeft",
      to_section: "geschaeftsmodell_und_markt",
      anchor_match: "subtopic_key",
    },
  ],
};

describe("validateHandbookSchema", () => {
  it("akzeptiert ein vollstaendig valides Schema", () => {
    const result = validateHandbookSchema(validSchema);
    expect(result.sections).toHaveLength(2);
    expect(result.cross_links).toHaveLength(1);
    expect(result.sections[0].render.subsections_by).toBe("subtopic");
  });

  it("akzeptiert Schema ohne cross_links", () => {
    const { cross_links: _ignored, ...withoutLinks } = validSchema;
    void _ignored;
    const result = validateHandbookSchema(withoutLinks);
    expect(result.cross_links).toEqual([]);
  });

  it("wirft bei null/Array/Primitiv", () => {
    expect(() => validateHandbookSchema(null)).toThrow(HandbookSchemaInvalidError);
    expect(() => validateHandbookSchema([])).toThrow(HandbookSchemaInvalidError);
    expect(() => validateHandbookSchema("string")).toThrow(HandbookSchemaInvalidError);
  });

  it("wirft bei fehlendem sections-Array", () => {
    expect(() => validateHandbookSchema({})).toThrow(/sections/);
  });

  it("wirft bei leerem sections-Array", () => {
    expect(() => validateHandbookSchema({ sections: [] })).toThrow(
      /at least one section/,
    );
  });

  it("wirft bei doppeltem section.key", () => {
    const dup = {
      sections: [
        { ...validSchema.sections[0] },
        { ...validSchema.sections[0] },
      ],
    };
    try {
      validateHandbookSchema(dup);
      expect.fail("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HandbookSchemaInvalidError);
      const e = err as HandbookSchemaInvalidError;
      expect(e.errors.some((x) => x.message.includes("duplicate key"))).toBe(true);
    }
  });

  it("wirft bei unbekanntem source.type", () => {
    const bad = {
      sections: [
        {
          key: "x",
          title: "X",
          order: 1,
          sources: [{ type: "unknown_thing", filter: {} }],
          render: { subsections_by: "block_key" },
        },
      ],
    };
    expect(() => validateHandbookSchema(bad)).toThrow(
      /sources\[0\]\.type/,
    );
  });

  it("wirft bei unbekanntem subsections_by", () => {
    const bad = {
      sections: [
        {
          key: "x",
          title: "X",
          order: 1,
          sources: [{ type: "knowledge_unit", filter: {} }],
          render: { subsections_by: "nope" },
        },
      ],
    };
    expect(() => validateHandbookSchema(bad)).toThrow(/render\.subsections_by/);
  });

  it("wirft bei cross_link auf unbekannte Section", () => {
    const bad = {
      sections: validSchema.sections,
      cross_links: [
        {
          from_section: "operatives_tagesgeschaeft",
          to_section: "nicht_da",
          anchor_match: "subtopic_key",
        },
      ],
    };
    expect(() => validateHandbookSchema(bad)).toThrow(/unknown section 'nicht_da'/);
  });

  it("wirft bei nicht-finiter section.order", () => {
    const bad = {
      sections: [
        {
          ...validSchema.sections[0],
          order: Number.NaN,
        },
      ],
    };
    expect(() => validateHandbookSchema(bad)).toThrow(/order/);
  });

  it("wirft bei fehlender section.render", () => {
    const bad = {
      sections: [
        {
          key: "x",
          title: "X",
          order: 1,
          sources: [{ type: "knowledge_unit", filter: {} }],
        },
      ],
    };
    expect(() => validateHandbookSchema(bad)).toThrow(/render/);
  });

  it("akzeptiert intro_template = null", () => {
    const ok = {
      sections: [
        {
          key: "x",
          title: "X",
          order: 1,
          sources: [{ type: "knowledge_unit", filter: {} }],
          render: { subsections_by: "block_key", intro_template: null },
        },
      ],
    };
    const result = validateHandbookSchema(ok);
    expect(result.sections[0].render.intro_template).toBeNull();
  });
});
