// SLC-139 MT-5 (FEAT-058) — Pure Aggregations-Lib fuer Diagnose-Funnel-Analytics.
//
// Erhaelt rohe `diagnose_event`-Rows + Question-Key-Reihenfolge aus dem
// partner_diagnostic-Template, berechnet:
//
//   - Globale KPIs: Sessions / Completion-Rate / Median-Time-on-Question /
//     Helper-Open-Rate / Abandoned-Sessions (30min-Window).
//   - Per-Frage-Stats: Drop-off-Rate / Helper-Open-Rate / TOQ p50/p75/p90.
//
// DSGVO-Schwelle: pro Frage wird `belowThreshold = startedCount < 5` gesetzt;
// alle Aggregations-Felder gehen dann auf `null` und die UI zeigt
// "zu wenig Daten". Die Schwelle bleibt schema-frei (Layer = Analytics-Page).
//
// Diese Lib hat KEINE I/O-Abhaengigkeit. Sie wird vom Server-Component
// `/admin/diagnose-funnel-analytics/page.tsx` gefuettert (Events via
// `createAdminClient()`).

const DSGVO_MIN_SESSIONS = 5;
const DEFAULT_ABANDONED_WINDOW_MS = 30 * 60 * 1000;

export interface RawDiagnoseEvent {
  capture_session_id: string;
  event_type: string;
  question_key: string | null;
  created_at: string;
  partner_org_id: string | null;
  is_test: boolean;
}

export interface AnalyticsKpis {
  totalSessions: number;
  completedSessions: number;
  completionRate: number | null;
  medianTimeOnQuestionMs: number | null;
  helperOpenRate: number | null;
  abandonedSessions: number;
}

export interface QuestionStats {
  questionKey: string;
  startedCount: number;
  answeredCount: number;
  helperOpenedCount: number;
  helperOpenRate: number | null;
  dropOffRate: number | null;
  toqP50Ms: number | null;
  toqP75Ms: number | null;
  toqP90Ms: number | null;
  belowThreshold: boolean;
}

export interface ComputeAnalyticsInput {
  events: RawDiagnoseEvent[];
  questionKeysInOrder: string[];
  nowIso?: string;
  abandonedWindowMs?: number;
}

export interface ComputeAnalyticsOutput {
  kpis: AnalyticsKpis;
  perQuestion: QuestionStats[];
}

interface SessionState {
  events: RawDiagnoseEvent[];
  hasCompleted: boolean;
  lastTimestampMs: number;
}

export function computeAnalytics(input: ComputeAnalyticsInput): ComputeAnalyticsOutput {
  const now = input.nowIso ? Date.parse(input.nowIso) : Date.now();
  const abandonedWindowMs = input.abandonedWindowMs ?? DEFAULT_ABANDONED_WINDOW_MS;

  const sessions = groupAndSortBySession(input.events);

  const totalSessions = sessions.size;
  let completedSessions = 0;
  let abandonedSessions = 0;

  const startedByQuestion = new Map<string, Set<string>>();
  const answeredByQuestion = new Map<string, Set<string>>();
  const helperOpenByQuestion = new Map<string, Set<string>>();
  const toqSamplesByQuestion = new Map<string, number[]>();

  for (const [sessionId, state] of sessions.entries()) {
    if (state.hasCompleted) completedSessions += 1;
    if (!state.hasCompleted && now - state.lastTimestampMs > abandonedWindowMs) {
      abandonedSessions += 1;
    }

    const questionStartTimes = new Map<string, number>();
    for (const event of state.events) {
      if (event.question_key === null) continue;
      const t = Date.parse(event.created_at);
      if (event.event_type === "question_start") {
        if (!questionStartTimes.has(event.question_key)) {
          questionStartTimes.set(event.question_key, t);
        }
        addToSet(startedByQuestion, event.question_key, sessionId);
      } else if (event.event_type === "question_answer") {
        addToSet(answeredByQuestion, event.question_key, sessionId);
      } else if (event.event_type === "helper_text_open") {
        addToSet(helperOpenByQuestion, event.question_key, sessionId);
      }
    }

    for (const [questionKey, startMs] of questionStartTimes.entries()) {
      const endMs = findFirstAnswerOrSkipAfter(state.events, questionKey, startMs);
      if (endMs === null) continue;
      const delta = endMs - startMs;
      if (delta < 0) continue;
      let samples = toqSamplesByQuestion.get(questionKey);
      if (!samples) {
        samples = [];
        toqSamplesByQuestion.set(questionKey, samples);
      }
      samples.push(delta);
    }
  }

  const helperOpenEventCount = countByType(input.events, "helper_text_open");
  const questionStartEventCount = countByType(input.events, "question_start");

  const helperOpenRate = questionStartEventCount > 0
    ? helperOpenEventCount / questionStartEventCount
    : null;
  const completionRate = totalSessions > 0 ? completedSessions / totalSessions : null;

  const allToqSamples: number[] = [];
  for (const samples of toqSamplesByQuestion.values()) {
    for (const value of samples) allToqSamples.push(value);
  }
  const medianTimeOnQuestionMs = allToqSamples.length > 0
    ? percentile(allToqSamples, 0.5)
    : null;

  const perQuestion: QuestionStats[] = input.questionKeysInOrder.map((questionKey, index) => {
    const startedCount = startedByQuestion.get(questionKey)?.size ?? 0;
    const answeredCount = answeredByQuestion.get(questionKey)?.size ?? 0;
    const helperOpenedCount = helperOpenByQuestion.get(questionKey)?.size ?? 0;
    const samples = toqSamplesByQuestion.get(questionKey) ?? [];

    const belowThreshold = startedCount < DSGVO_MIN_SESSIONS;

    const dropOffRate = computeDropOff({
      sessions,
      startedByQuestion,
      questionKey,
      questionKeysInOrder: input.questionKeysInOrder,
      questionIndex: index,
    });

    const questionHelperOpenRate = startedCount > 0
      ? helperOpenedCount / startedCount
      : null;

    return {
      questionKey,
      startedCount,
      answeredCount,
      helperOpenedCount,
      helperOpenRate: belowThreshold ? null : questionHelperOpenRate,
      dropOffRate: belowThreshold ? null : dropOffRate,
      toqP50Ms: belowThreshold ? null : (samples.length > 0 ? percentile(samples, 0.5) : null),
      toqP75Ms: belowThreshold ? null : (samples.length > 0 ? percentile(samples, 0.75) : null),
      toqP90Ms: belowThreshold ? null : (samples.length > 0 ? percentile(samples, 0.9) : null),
      belowThreshold,
    };
  });

  return {
    kpis: {
      totalSessions,
      completedSessions,
      completionRate,
      medianTimeOnQuestionMs,
      helperOpenRate,
      abandonedSessions,
    },
    perQuestion,
  };
}

function groupAndSortBySession(events: RawDiagnoseEvent[]): Map<string, SessionState> {
  const map = new Map<string, SessionState>();
  for (const event of events) {
    let state = map.get(event.capture_session_id);
    if (!state) {
      state = { events: [], hasCompleted: false, lastTimestampMs: 0 };
      map.set(event.capture_session_id, state);
    }
    state.events.push(event);
    if (event.event_type === "session_completed") state.hasCompleted = true;
    const ts = Date.parse(event.created_at);
    if (ts > state.lastTimestampMs) state.lastTimestampMs = ts;
  }
  for (const state of map.values()) {
    state.events.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }
  return map;
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) {
    set = new Set<V>();
    map.set(key, set);
  }
  set.add(value);
}

function countByType(events: RawDiagnoseEvent[], eventType: string): number {
  let count = 0;
  for (const event of events) {
    if (event.event_type === eventType) count += 1;
  }
  return count;
}

function findFirstAnswerOrSkipAfter(
  events: RawDiagnoseEvent[],
  questionKey: string,
  startMs: number,
): number | null {
  for (const event of events) {
    if (event.question_key !== questionKey) continue;
    if (event.event_type !== "question_answer" && event.event_type !== "question_skip") continue;
    const t = Date.parse(event.created_at);
    if (t > startMs) return t;
  }
  return null;
}

function computeDropOff(args: {
  sessions: Map<string, SessionState>;
  startedByQuestion: Map<string, Set<string>>;
  questionKey: string;
  questionKeysInOrder: string[];
  questionIndex: number;
}): number | null {
  const started = args.startedByQuestion.get(args.questionKey);
  if (!started || started.size === 0) return null;

  const isLast = args.questionIndex === args.questionKeysInOrder.length - 1;
  if (isLast) {
    let reachedCompletion = 0;
    for (const sessionId of started) {
      if (args.sessions.get(sessionId)?.hasCompleted) reachedCompletion += 1;
    }
    return (started.size - reachedCompletion) / started.size;
  }

  const nextKey = args.questionKeysInOrder[args.questionIndex + 1];
  const nextStarted = args.startedByQuestion.get(nextKey);
  if (!nextStarted) return 1;

  let reachedNext = 0;
  for (const sessionId of started) {
    if (nextStarted.has(sessionId)) reachedNext += 1;
  }
  return (started.size - reachedNext) / started.size;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
