// SLC-139 MT-5/MT-6 (FEAT-058) — Vitest fuer Aggregations-Lib.

import { describe, it, expect } from "vitest";
import {
  computeAnalytics,
  type RawDiagnoseEvent,
} from "../aggregations";

const QUESTION_KEYS = ["q1", "q2", "q3"];

function mkEvent(
  sessionId: string,
  type: string,
  questionKey: string | null,
  offsetMs: number,
  base = "2026-05-22T10:00:00.000Z",
): RawDiagnoseEvent {
  return {
    capture_session_id: sessionId,
    event_type: type,
    question_key: questionKey,
    created_at: new Date(Date.parse(base) + offsetMs).toISOString(),
    partner_org_id: null,
    is_test: false,
  };
}

describe("computeAnalytics — KPIs", () => {
  it("returns null KPIs for empty event list", () => {
    const out = computeAnalytics({ events: [], questionKeysInOrder: QUESTION_KEYS });
    expect(out.kpis.totalSessions).toBe(0);
    expect(out.kpis.completedSessions).toBe(0);
    expect(out.kpis.completionRate).toBeNull();
    expect(out.kpis.medianTimeOnQuestionMs).toBeNull();
    expect(out.kpis.helperOpenRate).toBeNull();
    expect(out.kpis.abandonedSessions).toBe(0);
    expect(out.perQuestion).toHaveLength(3);
    expect(out.perQuestion.every((q) => q.belowThreshold)).toBe(true);
  });

  it("counts distinct sessions correctly across multiple events", () => {
    const events = [
      mkEvent("s1", "question_start", "q1", 0),
      mkEvent("s1", "question_answer", "q1", 1000),
      mkEvent("s2", "question_start", "q1", 0),
      mkEvent("s3", "session_heartbeat", null, 0),
    ];
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    expect(out.kpis.totalSessions).toBe(3);
  });

  it("computes completion-rate as completed/total sessions", () => {
    const events = [
      mkEvent("s1", "question_start", "q1", 0),
      mkEvent("s1", "session_completed", null, 5000),
      mkEvent("s2", "question_start", "q1", 0),
      mkEvent("s3", "question_start", "q1", 0),
      mkEvent("s3", "session_completed", null, 5000),
      mkEvent("s4", "question_start", "q1", 0),
    ];
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    expect(out.kpis.totalSessions).toBe(4);
    expect(out.kpis.completedSessions).toBe(2);
    expect(out.kpis.completionRate).toBe(0.5);
  });

  it("computes global helper-open-rate = helper_text_open events / question_start events", () => {
    const events = [
      mkEvent("s1", "question_start", "q1", 0),
      mkEvent("s1", "question_start", "q2", 100),
      mkEvent("s1", "question_start", "q3", 200),
      mkEvent("s1", "helper_text_open", "q1", 300),
      mkEvent("s1", "helper_text_open", "q2", 400),
    ];
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    expect(out.kpis.helperOpenRate).toBeCloseTo(2 / 3, 5);
  });
});

describe("computeAnalytics — Drop-off", () => {
  it("computes drop-off for non-last question as fraction not reaching next", () => {
    const events: RawDiagnoseEvent[] = [];
    for (let i = 1; i <= 10; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q1", 0));
    }
    for (let i = 1; i <= 6; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q2", 1000));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    const q1 = out.perQuestion.find((q) => q.questionKey === "q1")!;
    expect(q1.startedCount).toBe(10);
    expect(q1.dropOffRate).toBeCloseTo(0.4, 5);
  });

  it("computes drop-off for last question as fraction not reaching session_completed", () => {
    const events: RawDiagnoseEvent[] = [];
    for (let i = 1; i <= 8; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q3", 0));
    }
    for (let i = 1; i <= 5; i++) {
      events.push(mkEvent(`s${i}`, "session_completed", null, 5000));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    const q3 = out.perQuestion.find((q) => q.questionKey === "q3")!;
    expect(q3.startedCount).toBe(8);
    expect(q3.dropOffRate).toBeCloseTo(3 / 8, 5);
  });
});

describe("computeAnalytics — DSGVO 5-sessions threshold", () => {
  it("masks aggregations for questions with < 5 sessions started", () => {
    const events: RawDiagnoseEvent[] = [];
    for (let i = 1; i <= 4; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q1", 0));
      events.push(mkEvent(`s${i}`, "question_answer", "q1", 1000));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    const q1 = out.perQuestion.find((q) => q.questionKey === "q1")!;
    expect(q1.belowThreshold).toBe(true);
    expect(q1.dropOffRate).toBeNull();
    expect(q1.helperOpenRate).toBeNull();
    expect(q1.toqP50Ms).toBeNull();
  });

  it("exposes aggregations for questions with >= 5 sessions started", () => {
    const events: RawDiagnoseEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q1", 0));
      events.push(mkEvent(`s${i}`, "question_answer", "q1", 1000));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    const q1 = out.perQuestion.find((q) => q.questionKey === "q1")!;
    expect(q1.belowThreshold).toBe(false);
    expect(q1.dropOffRate).not.toBeNull();
    expect(q1.toqP50Ms).not.toBeNull();
  });
});

describe("computeAnalytics — TOQ percentiles", () => {
  it("computes p50/p75/p90 from per-session question_start -> question_answer deltas", () => {
    const events: RawDiagnoseEvent[] = [];
    const deltas = [1000, 2000, 3000, 4000, 5000];
    for (let i = 0; i < deltas.length; i++) {
      events.push(mkEvent(`s${i + 1}`, "question_start", "q1", 0));
      events.push(mkEvent(`s${i + 1}`, "question_answer", "q1", deltas[i]));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    const q1 = out.perQuestion.find((q) => q.questionKey === "q1")!;
    expect(q1.toqP50Ms).toBe(3000);
    expect(q1.toqP90Ms).toBeCloseTo(4600, 0);
  });

  it("computes median KPI across all per-question samples", () => {
    const events: RawDiagnoseEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      events.push(mkEvent(`s${i}`, "question_start", "q1", 0));
      events.push(mkEvent(`s${i}`, "question_answer", "q1", 2000));
    }
    const out = computeAnalytics({ events, questionKeysInOrder: QUESTION_KEYS });
    expect(out.kpis.medianTimeOnQuestionMs).toBe(2000);
  });
});

describe("computeAnalytics — Abandoned-Detector (MT-6)", () => {
  it("counts sessions without completed-event AND last event older than 30min as abandoned", () => {
    const baseNow = "2026-05-22T12:00:00.000Z";
    const events: RawDiagnoseEvent[] = [
      mkEvent("done1", "question_start", "q1", 0, "2026-05-22T11:00:00.000Z"),
      mkEvent("done1", "session_completed", null, 1000, "2026-05-22T11:00:00.000Z"),
      mkEvent("active1", "question_start", "q1", 0, "2026-05-22T11:55:00.000Z"),
      mkEvent("aban1", "question_start", "q1", 0, "2026-05-22T11:00:00.000Z"),
      mkEvent("aban1", "question_answer", "q1", 1000, "2026-05-22T11:00:00.000Z"),
      mkEvent("aban2", "question_start", "q2", 0, "2026-05-22T11:25:00.000Z"),
    ];
    const out = computeAnalytics({
      events,
      questionKeysInOrder: QUESTION_KEYS,
      nowIso: baseNow,
    });
    expect(out.kpis.totalSessions).toBe(4);
    expect(out.kpis.completedSessions).toBe(1);
    expect(out.kpis.abandonedSessions).toBe(2);
  });

  it("does not count completed sessions as abandoned regardless of last-event-age", () => {
    const baseNow = "2026-05-22T12:00:00.000Z";
    const events: RawDiagnoseEvent[] = [
      mkEvent("s1", "question_start", "q1", 0, "2026-05-22T09:00:00.000Z"),
      mkEvent("s1", "session_completed", null, 1000, "2026-05-22T09:00:00.000Z"),
    ];
    const out = computeAnalytics({
      events,
      questionKeysInOrder: QUESTION_KEYS,
      nowIso: baseNow,
    });
    expect(out.kpis.abandonedSessions).toBe(0);
  });

  it("respects custom abandonedWindowMs", () => {
    const baseNow = "2026-05-22T12:00:00.000Z";
    const events: RawDiagnoseEvent[] = [
      mkEvent("s1", "question_start", "q1", 0, "2026-05-22T11:50:00.000Z"),
    ];
    const out = computeAnalytics({
      events,
      questionKeysInOrder: QUESTION_KEYS,
      nowIso: baseNow,
      abandonedWindowMs: 5 * 60 * 1000,
    });
    expect(out.kpis.abandonedSessions).toBe(1);
  });
});
