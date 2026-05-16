import { describe, it, expect } from "vitest";
import {
  computeBlockScores,
  type TemplateBlock,
  type TemplateQuestion,
} from "../light-pipeline";

// =========================================================================
// Test-Fixtures
// =========================================================================
//
// Inhalts-Quelle: docs/DIAGNOSE_WERKZEUG_INHALT.md (BL-095 Workshop v1).
// Wir benutzen reale Antwort-Strings aus dem Workshop, damit String-Drift
// (R-V63-2) gegen die echte Template-Konfiguration getestet wird.

const blockKiReifeQ1: TemplateQuestion = {
  key: "ki_reife.q1",
  text: "Wie viele zentrale Systeme...",
  question_type: "multiple_choice",
  scale_direction: "negative",
  score_mapping: [
    { label: "Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollständigen Überblick", score: 0 },
    { label: "6-10 Systeme oder Listen — es funktioniert, aber vieles ist verstreut", score: 25 },
    { label: "4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden", score: 50 },
    { label: "2-3 zentrale Systeme — die Firma ist weitgehend strukturiert", score: 75 },
    { label: "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich", score: 100 },
  ],
};

const blockKiReifeQ2: TemplateQuestion = {
  key: "ki_reife.q2",
  text: "Wie verlässlich sind Ihre Stammdaten...",
  question_type: "likert_5",
  scale_direction: "positive",
  score_mapping: [
    { label: "Sehr unzuverlässig — wir müssen oft nachfragen oder suchen", score: 0 },
    { label: "Eher unzuverlässig — es gibt regelmäßig Dubletten, alte Daten oder Lücken", score: 25 },
    { label: "Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend", score: 50 },
    { label: "Eher zuverlässig — Fehler kommen vor, sind aber nicht die Regel", score: 75 },
    { label: "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen", score: 100 },
  ],
};

const blockKiReifeQ3: TemplateQuestion = {
  key: "ki_reife.q3",
  text: "Wie klar ist festgelegt...",
  question_type: "multiple_choice",
  scale_direction: "positive",
  score_mapping: [
    { label: "Niemand — es kümmert sich, wer gerade Zeit hat", score: 0 },
    { label: "Der Geschäftsführer — aber eher nebenbei und ohne feste Struktur", score: 25 },
    { label: "Einzelne Mitarbeiter kümmern sich darum, aber ohne klare Gesamtverantwortung", score: 50 },
    { label: "Es gibt klare Zuständigkeiten für einzelne Bereiche", score: 75 },
    { label: "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse", score: 100 },
  ],
};

const blockKiReifeQ4: TemplateQuestion = {
  key: "ki_reife.q4",
  text: "Wie stark laufen Prozesse ueber Papier...",
  question_type: "multiple_choice",
  scale_direction: "negative",
  score_mapping: [
    { label: "Sehr stark — ohne Papier, E-Mail und Excel würde vieles stehen bleiben", score: 0 },
    { label: "Stark — die offiziellen Systeme decken viele Abläufe nicht sauber ab", score: 25 },
    { label: "Gemischt — wichtige Teile sind digital, aber viele Übergaben sind manuell", score: 50 },
    { label: "Eher gering — die meisten Prozesse laufen in geregelten Systemen", score: 75 },
    { label: "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt", score: 100 },
  ],
};

const blockKiReife: TemplateBlock = {
  key: "ki_reife",
  title: "Strukturelle KI-Reife",
  intro: "Dieser Baustein misst, ob Ihre Firma überhaupt sauber genug organisiert ist...",
  order: 1,
  questions: [blockKiReifeQ1, blockKiReifeQ2, blockKiReifeQ3, blockKiReifeQ4],
  comment_anchors: {
    low: "Ihre strukturelle Basis ist aktuell nicht KI-tauglich...",
    mid: "Es gibt erste Strukturen...",
    high: "Die Firma hat eine brauchbare strukturelle Grundlage...",
  },
};

const blockWorkaroundQ1: TemplateQuestion = {
  key: "workaround_dunkelziffer.q1",
  text: "Wie viele Excel-Listen...",
  question_type: "numeric_bucket",
  scale_direction: "negative",
  score_mapping: [
    { label: "0 bekannte Listen oder Schatten-Dateien", score: 100 },
    { label: "1-3 Listen", score: 75 },
    { label: "4-10 Listen", score: 50 },
    { label: "11-20 Listen", score: 25 },
    { label: "Mehr als 20 Listen oder niemand weiß es genau", score: 0 },
  ],
};

const blockWorkaround: TemplateBlock = {
  key: "workaround_dunkelziffer",
  title: "Workaround-Dunkelziffer",
  intro: "Dieser Baustein misst, wie viele inoffizielle Umgehungslösungen...",
  order: 6,
  questions: [
    blockWorkaroundQ1,
    {
      ...blockWorkaroundQ1,
      key: "workaround_dunkelziffer.q2",
    },
    {
      ...blockWorkaroundQ1,
      key: "workaround_dunkelziffer.q3",
    },
    {
      ...blockWorkaroundQ1,
      key: "workaround_dunkelziffer.q4",
    },
  ],
  comment_anchors: {
    low: "...",
    mid: "...",
    high: "...",
  },
};

// =========================================================================
// Tests
// =========================================================================

describe("computeBlockScores — happy paths", () => {
  it("returns max score 100 when all answers map to 100", () => {
    const answers = {
      "ki_reife.q1": "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    expect(computeBlockScores([blockKiReife], answers)).toEqual({ ki_reife: 100 });
  });

  it("returns min score 0 when all answers map to 0", () => {
    const answers = {
      "ki_reife.q1": "Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollständigen Überblick",
      "ki_reife.q2": "Sehr unzuverlässig — wir müssen oft nachfragen oder suchen",
      "ki_reife.q3": "Niemand — es kümmert sich, wer gerade Zeit hat",
      "ki_reife.q4": "Sehr stark — ohne Papier, E-Mail und Excel würde vieles stehen bleiben",
    };

    expect(computeBlockScores([blockKiReife], answers)).toEqual({ ki_reife: 0 });
  });

  it("computes arithmetic mean of 4 question-scores (Math.round)", () => {
    // 0 + 25 + 50 + 75 = 150 / 4 = 37.5 → Math.round → 38
    const answers = {
      "ki_reife.q1": "Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollständigen Überblick",
      "ki_reife.q2": "Eher unzuverlässig — es gibt regelmäßig Dubletten, alte Daten oder Lücken",
      "ki_reife.q3": "Einzelne Mitarbeiter kümmern sich darum, aber ohne klare Gesamtverantwortung",
      "ki_reife.q4": "Eher gering — die meisten Prozesse laufen in geregelten Systemen",
    };

    expect(computeBlockScores([blockKiReife], answers)).toEqual({ ki_reife: 38 });
  });

  it("rounds 12.5 to 13 (Math.round half-up for positive)", () => {
    // 0 + 0 + 25 + 25 = 50 / 4 = 12.5 → Math.round → 13
    const answers = {
      "ki_reife.q1": "Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollständigen Überblick",
      "ki_reife.q2": "Sehr unzuverlässig — wir müssen oft nachfragen oder suchen",
      "ki_reife.q3": "Der Geschäftsführer — aber eher nebenbei und ohne feste Struktur",
      "ki_reife.q4": "Stark — die offiziellen Systeme decken viele Abläufe nicht sauber ab",
    };

    expect(computeBlockScores([blockKiReife], answers)).toEqual({ ki_reife: 13 });
  });

  it("handles numeric_bucket with inverted score order (high score = low count)", () => {
    const answers = {
      "workaround_dunkelziffer.q1": "0 bekannte Listen oder Schatten-Dateien",
      "workaround_dunkelziffer.q2": "0 bekannte Listen oder Schatten-Dateien",
      "workaround_dunkelziffer.q3": "0 bekannte Listen oder Schatten-Dateien",
      "workaround_dunkelziffer.q4": "0 bekannte Listen oder Schatten-Dateien",
    };

    expect(computeBlockScores([blockWorkaround], answers)).toEqual({
      workaround_dunkelziffer: 100,
    });
  });

  it("aggregates multiple blocks independently", () => {
    const answers = {
      "ki_reife.q1": "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
      "workaround_dunkelziffer.q1": "Mehr als 20 Listen oder niemand weiß es genau",
      "workaround_dunkelziffer.q2": "Mehr als 20 Listen oder niemand weiß es genau",
      "workaround_dunkelziffer.q3": "Mehr als 20 Listen oder niemand weiß es genau",
      "workaround_dunkelziffer.q4": "Mehr als 20 Listen oder niemand weiß es genau",
    };

    expect(computeBlockScores([blockKiReife, blockWorkaround], answers)).toEqual({
      ki_reife: 100,
      workaround_dunkelziffer: 0,
    });
  });

  it("ignores extra answers that are not in any block (forward-compat)", () => {
    const answers = {
      "ki_reife.q1": "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
      "future_block.q1": "future answer value", // ignored
      "v2_extra": "another extra",                 // ignored
    };

    expect(computeBlockScores([blockKiReife], answers)).toEqual({ ki_reife: 100 });
  });

  it("is deterministic: two calls with identical inputs produce identical output", () => {
    const answers = {
      "ki_reife.q1": "4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden",
      "ki_reife.q2": "Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend",
      "ki_reife.q3": "Einzelne Mitarbeiter kümmern sich darum, aber ohne klare Gesamtverantwortung",
      "ki_reife.q4": "Gemischt — wichtige Teile sind digital, aber viele Übergaben sind manuell",
    };

    const result1 = computeBlockScores([blockKiReife], answers);
    const result2 = computeBlockScores([blockKiReife], answers);
    expect(result1).toEqual(result2);
    expect(result1).toEqual({ ki_reife: 50 });
  });

  it("returns empty object when blocks array is empty", () => {
    expect(computeBlockScores([], {})).toEqual({});
  });
});

describe("computeBlockScores — error paths", () => {
  it("throws when a block has zero questions", () => {
    const emptyBlock: TemplateBlock = {
      ...blockKiReife,
      questions: [],
    };

    expect(() => computeBlockScores([emptyBlock], {})).toThrow(
      /Block "ki_reife" has no questions/,
    );
  });

  it("throws when question_type is unknown (forward-compat check)", () => {
    const blockWithUnknownType: TemplateBlock = {
      ...blockKiReife,
      questions: [
        {
          ...blockKiReifeQ1,
          // @ts-expect-error — deliberate runtime test for unknown type
          question_type: "matrix_grid",
        },
      ],
    };

    expect(() =>
      computeBlockScores([blockWithUnknownType], {
        "ki_reife.q1": "irrelevant",
      }),
    ).toThrow(/Unknown question_type "matrix_grid"/);
  });

  it("throws when score_mapping is empty", () => {
    const blockWithEmptyMapping: TemplateBlock = {
      ...blockKiReife,
      questions: [
        {
          ...blockKiReifeQ1,
          score_mapping: [],
        },
      ],
    };

    expect(() =>
      computeBlockScores([blockWithEmptyMapping], { "ki_reife.q1": "irrelevant" }),
    ).toThrow(/Question "ki_reife.q1" has empty score_mapping/);
  });

  it("throws when answer is undefined (key missing in answers map)", () => {
    expect(() => computeBlockScores([blockKiReife], {})).toThrow(
      /Missing answer for question ki_reife.q1/,
    );
  });

  it("throws when answer is empty string", () => {
    const answers = {
      "ki_reife.q1": "",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    expect(() => computeBlockScores([blockKiReife], answers)).toThrow(
      /Missing answer for question ki_reife.q1/,
    );
  });

  it("throws when answer does not match any score_mapping label (R-V63-2 string drift)", () => {
    const answers = {
      "ki_reife.q1": "Ein paar Systeme",   // not in score_mapping
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    expect(() => computeBlockScores([blockKiReife], answers)).toThrow(
      /No score mapping for question ki_reife.q1, answer="Ein paar Systeme"/,
    );
  });

  it("does NOT trim whitespace — strict label match (drift sentinel)", () => {
    // Trailing space differs from any score_mapping label → must throw
    const answers = {
      "ki_reife.q1": "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich ",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    expect(() => computeBlockScores([blockKiReife], answers)).toThrow(
      /No score mapping for question ki_reife.q1/,
    );
  });

  it("truncates long answer-previews in error message to 40 chars + ellipsis", () => {
    const longAnswer = "A".repeat(100);
    const answers = {
      "ki_reife.q1": longAnswer,
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    expect(() => computeBlockScores([blockKiReife], answers)).toThrow(
      /answer="A{40}\.\.\."/,
    );
  });

  it("does not truncate short answer-previews in error message", () => {
    const answers = {
      "ki_reife.q1": "short",
      "ki_reife.q2": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen",
      "ki_reife.q3": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse",
      "ki_reife.q4": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt",
    };

    try {
      computeBlockScores([blockKiReife], answers);
      throw new Error("Expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('answer="short"');
      expect(msg).not.toContain("...");
    }
  });
});
