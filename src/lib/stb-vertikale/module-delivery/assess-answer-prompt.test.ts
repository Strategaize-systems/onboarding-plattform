// Unit-Tests fuer die pure Live-Scoring-Kernlogik (SLC-179 MT-2).
// Hermetisch (kein DB/LLM) — deckt AC-179-3/4: Happy/Trigger, kein-Trigger,
// Guardrail-Cap, fail-open, Heilung (F-E), Idempotenz, Block-Scoping + Prompt.

import { describe, it, expect } from "vitest";

import type { TemplateQuestion } from "@/lib/db/template-queries";
import {
  MAX_RUECKFRAGEN_PER_BLOCK,
  ModulAnswerAssessmentSchema,
  buildAssessAnswerPrompt,
  computeAssessOutcome,
  type ModulAnswerAssessment,
} from "./assess-answer-prompt";

function makeQuestion(overrides: Partial<TemplateQuestion> = {}): TemplateQuestion {
  return {
    id: "uuid-1",
    frage_id: "q1",
    text: "Wie ist die Vertretung im Krankheitsfall geregelt?",
    ebene: "kern",
    unterbereich: "Organisation",
    position: 1,
    owner_dependency: false,
    deal_blocker: false,
    sop_trigger: false,
    ko_hart: false,
    ko_soft: false,
    ...overrides,
  };
}

const OK: ModulAnswerAssessment = { status: "ok", rueckfrage: null };
const INCOMPLETE: ModulAnswerAssessment = {
  status: "unvollstaendig",
  rueckfrage: "Wer vertritt Sie konkret bei Ausfall?",
};
const RISKY: ModulAnswerAssessment = {
  status: "riskant",
  rueckfrage: "Was passiert mit den Mandaten ohne Vertretungsregelung?",
};

describe("MAX_RUECKFRAGEN_PER_BLOCK (Founder F-A/1)", () => {
  it("ist auf 2 gesetzt", () => {
    expect(MAX_RUECKFRAGEN_PER_BLOCK).toBe(2);
  });
});

describe("ModulAnswerAssessmentSchema", () => {
  it("defaultet rueckfrage auf null, wenn nicht geliefert", () => {
    const parsed = ModulAnswerAssessmentSchema.parse({ status: "ok" });
    expect(parsed.rueckfrage).toBeNull();
  });

  it("akzeptiert die drei Status-Werte und lehnt Fremdwerte ab", () => {
    expect(ModulAnswerAssessmentSchema.safeParse({ status: "riskant" }).success).toBe(true);
    expect(ModulAnswerAssessmentSchema.safeParse({ status: "vielleicht" }).success).toBe(false);
  });
});

describe("buildAssessAnswerPrompt", () => {
  it("enthaelt Frage, Unterthema und Antwort im User-Prompt", () => {
    const q = makeQuestion();
    const { user, system } = buildAssessAnswerPrompt(q, "Keine feste Regelung.");
    expect(user).toContain(q.text);
    expect(user).toContain(q.unterbereich);
    expect(user).toContain("Keine feste Regelung.");
    // Konservativ-Instruktion + JSON-only im System-Prompt.
    expect(system).toContain("KONSERVATIV");
    expect(system).toContain("AUSSCHLIESSLICH mit JSON");
  });

  it("spiegelt gesetzte Flags als Bedeutungs-Hinweis", () => {
    const q = makeQuestion({ ko_hart: true, owner_dependency: true });
    const { user } = buildAssessAnswerPrompt(q, "…");
    expect(user).toContain("hartes KO-Kriterium");
    expect(user).toContain("Inhaberabhaengigkeit");
  });

  it("nutzt einen neutralen Hinweis, wenn keine Flags gesetzt sind", () => {
    const { user } = buildAssessAnswerPrompt(makeQuestion(), "…");
    expect(user).toContain("allgemeiner Reifegrad-Aspekt");
  });
});

describe("computeAssessOutcome", () => {
  it("Happy/Trigger: riskante Neu-Antwort erzeugt Rueckfrage + Trigger-Hit", () => {
    const out = computeAssessOutcome(RISKY, "q1", ["q1", "q2"], []);
    expect(out.rueckfrage).toBe(RISKY.rueckfrage);
    expect(out.nextTriggerHits).toEqual(["q1"]);
  });

  it("Trigger auch bei status 'unvollstaendig'", () => {
    const out = computeAssessOutcome(INCOMPLETE, "q1", ["q1"], []);
    expect(out.rueckfrage).toBe(INCOMPLETE.rueckfrage);
    expect(out.nextTriggerHits).toEqual(["q1"]);
  });

  it("kein-Trigger: 'ok'-Antwort ohne Vorgeschichte -> keine Aenderung", () => {
    const out = computeAssessOutcome(OK, "q1", ["q1"], []);
    expect(out.rueckfrage).toBeNull();
    expect(out.nextTriggerHits).toBeNull();
  });

  it("fail-open: assessment null -> keine Rueckfrage, keine Zustandsaenderung", () => {
    const out = computeAssessOutcome(null, "q1", ["q1"], ["q2"]);
    expect(out.rueckfrage).toBeNull();
    expect(out.nextTriggerHits).toBeNull();
  });

  it("Heilung (F-E): frueher getriggerte, jetzt 'ok'-Frage wird entfernt", () => {
    const out = computeAssessOutcome(OK, "q1", ["q1", "q2"], ["q1", "q2"]);
    expect(out.rueckfrage).toBeNull();
    expect(out.nextTriggerHits).toEqual(["q2"]);
  });

  it("Idempotenz: erneut riskante, bereits vermerkte Frage -> Rueckfrage, kein Doppel-Hit", () => {
    const out = computeAssessOutcome(RISKY, "q1", ["q1", "q2"], ["q1"]);
    expect(out.rueckfrage).toBe(RISKY.rueckfrage);
    expect(out.nextTriggerHits).toBeNull();
  });

  it("Guardrail-Cap: dritter neuer Trigger im selben Block wird unterdrueckt", () => {
    const blockFrageIds = ["q1", "q2", "q3"];
    const out = computeAssessOutcome(RISKY, "q3", blockFrageIds, ["q1", "q2"]);
    expect(out.rueckfrage).toBeNull();
    expect(out.nextTriggerHits).toBeNull();
  });

  it("Guardrail zaehlt nur Hits des eigenen Blocks (Fremdblock-Hits kappen nicht)", () => {
    const blockFrageIds = ["q1", "q2"];
    // Zwei bestehende Hits, aber beide aus einem anderen Block (x1/x2).
    const out = computeAssessOutcome(RISKY, "q1", blockFrageIds, ["x1", "x2"]);
    expect(out.rueckfrage).toBe(RISKY.rueckfrage);
    expect(out.nextTriggerHits).toEqual(["x1", "x2", "q1"]);
  });

  it("zweiter neuer Trigger im Block ist noch erlaubt (Grenzfall < MAX)", () => {
    const out = computeAssessOutcome(RISKY, "q2", ["q1", "q2", "q3"], ["q1"]);
    expect(out.rueckfrage).toBe(RISKY.rueckfrage);
    expect(out.nextTriggerHits).toEqual(["q1", "q2"]);
  });

  it("Trigger ohne gelieferte Rueckfrage: Hit wird trotzdem vermerkt, rueckfrage null", () => {
    const out = computeAssessOutcome(
      { status: "riskant", rueckfrage: null },
      "q1",
      ["q1"],
      [],
    );
    expect(out.rueckfrage).toBeNull();
    expect(out.nextTriggerHits).toEqual(["q1"]);
  });
});
