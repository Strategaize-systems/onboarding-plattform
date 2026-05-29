// V8 SLC-148 MT-4 — Pure-Function-Library fuer Mandanten-Report-Teaser.
//
// Deterministische Score-Engine ueber Template `exit-readiness-teaser-v1`
// (Migration 102). Wird in MT-6 von Server-Action `finalizeMandantenReport`
// + Worker-Branch `runV8MandantenReportPipeline` konsumiert.
//
// Alle Funktionen sind:
// - synchron (kein DB-Touch, kein I/O)
// - deterministisch (gleicher Input -> gleicher Output, keine Random/Date-
//   Effects)
// - frei von Side-Effects (kein Mutate auf Inputs)
//
// Architektur per FEAT-065 / RPT-349 (DEC-160 V8-Pipeline). Klassifizierungs-
// Labels + Meaning-Texte aus
// `docs/curriculum/v2/EXIT_READINESS_PRINZIPIEN.md` Z. 498-500.

import type {
  Answer,
  HausaufgabeItem,
  HebelItem,
  ModulKey,
  ModuleScores,
  ModuleStufen,
  ReflexionItem,
  SuiClassification,
  V8StufenLookup,
  V8Template,
  V8TemplateBlock,
} from "./types";

const MODUL_KEYS: ModulKey[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
];

// ---------------------------------------------------------------------------
// computeModuleScores
// ---------------------------------------------------------------------------

/**
 * Berechnet pro Modul M1..M9 den Durchschnitts-Score (0-10) aus den
 * beantworteten reife_skala_5 Fragen. Fehlende Antworten werden vom
 * Nenner ausgeschlossen. Ohne valide Antwort -> Score 0.
 *
 * M0 (Hygiene) und M10 (Reflexion) werden ignoriert.
 */
export function computeModuleScores(
  answers: Answer[],
  template: V8Template
): ModuleScores {
  const answerMap = buildAnswerMap(answers);
  const scores = {} as ModuleScores;

  for (const key of MODUL_KEYS) {
    const upperModulId = key.toUpperCase(); // "m1" -> "M1"
    const block = template.blocks.find(
      (b) =>
        b.modul_id === upperModulId &&
        b.answer_schema_kind === "reife_skala_5"
    );
    if (!block || !block.score_mapping) {
      scores[key] = 0;
      continue;
    }

    let sum = 0;
    let count = 0;
    for (const question of block.questions) {
      const value = answerMap.get(question.frage_id);
      if (value === undefined) continue;
      const mapped = block.score_mapping[value];
      if (mapped === undefined || typeof mapped !== "number") continue;
      sum += mapped;
      count += 1;
    }

    scores[key] = count === 0 ? 0 : sum / count;
  }

  return scores;
}

// ---------------------------------------------------------------------------
// computeSui
// ---------------------------------------------------------------------------

/**
 * Gewichteter SUI-Score 0-100 aus Module-Scores 0-10.
 *
 * Gewichtung pro FEAT-065 / DEC-160: m1..m8 einfach, m9 doppelt. Wuerde man
 * direkt aus den Gewichtungs-Faktoren der `template.metadata.gewichtung`
 * (m1..m8 = 10, m9 = 20, Summe 100) rechnen, gaebe `(sum)/100` nur 0-10.
 * Daher: Gewichts-Mittel auf 0-10 berechnen UND mit 10 multiplizieren, um
 * zu 0-100 zu skalieren — was sich algebraisch zu `sum(m1..m8) + m9*2`
 * vereinfacht.
 *
 * AC-Verifikation:
 * - Alle m = 10 -> SUI = 80 + 20 = 100
 * - Alle m = 5  -> SUI = 40 + 10 = 50
 * - m1..m8 = 10, m9 = 0 -> SUI = 80
 * - m1..m8 = 0, m9 = 10 -> SUI = 20
 */
export function computeSui(moduleScores: ModuleScores): number {
  return (
    moduleScores.m1 +
    moduleScores.m2 +
    moduleScores.m3 +
    moduleScores.m4 +
    moduleScores.m5 +
    moduleScores.m6 +
    moduleScores.m7 +
    moduleScores.m8 +
    moduleScores.m9 * 2
  );
}

// ---------------------------------------------------------------------------
// classifySui
// ---------------------------------------------------------------------------

/**
 * Klassifiziert SUI 0-100 in eines der drei Bereiche per
 * EXIT_READINESS_PRINZIPIEN.md Z. 498-500.
 *
 * - 0-30:   Strukturluecke (rot)
 * - 31-55:  Teil-Reife (amber)
 * - 56-100: Tragbar (gruen)
 *
 * Grenzen sind UNTERE inklusiv, OBERE inklusiv (0..30, 31..55, 56..100).
 */
export function classifySui(sui: number): SuiClassification {
  if (sui <= 30) {
    return {
      kind: "strukturluecke",
      color: "rot",
      label: "Strukturluecke",
      meaning:
        "Substantielle Vorarbeit noetig. Mindestens 12-24 Monate strukturierter Aufbau, bevor ein Verkauf sinnvoll ist.",
    };
  }
  if (sui <= 55) {
    return {
      kind: "teil_reife",
      color: "amber",
      label: "Teil-Reife",
      meaning:
        "Erste Substanz da, aber wesentliche Luecken. 6-12 Monate gezielte Verbesserung in den Schwach-Modulen.",
    };
  }
  return {
    kind: "tragbar",
    color: "gruen",
    label: "Tragbar",
    meaning:
      "Grundsaetzlich uebergabefaehig. Letzte Schliff-Arbeiten je nach Schwach-Punkten. Verkaufs-Vorbereitung kann starten.",
  };
}

// ---------------------------------------------------------------------------
// mapModuleScoreToStufe
// ---------------------------------------------------------------------------

/**
 * Mappt einen Modul-Score 0-10 auf eine diskrete Stufe 1-5.
 *
 * Exakt-Stufen-Scores 0/2/5/8/10 -> 1/2/3/4/5.
 * Bereichs-Mitten 1/4/7 -> 2/3/4 (Tie-Up bei Midpoint).
 *
 * Grenzen:
 * - score < 1     -> Stufe 1
 * - 1 <= score <= 3  -> Stufe 2
 * - 3 < score <= 6   -> Stufe 3
 * - 6 < score <= 9   -> Stufe 4
 * - score > 9     -> Stufe 5
 */
export function mapModuleScoreToStufe(score: number): number {
  if (score < 1) return 1;
  if (score <= 3) return 2;
  if (score <= 6) return 3;
  if (score <= 9) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// aggregateHausaufgaben
// ---------------------------------------------------------------------------

/**
 * Filtert M0-Antworten (Hygiene) mit Status "nein" oder "teilweise".
 *
 * Reihenfolge der Items folgt der Template-Reihenfolge der M0-Fragen,
 * nicht der Reihenfolge der Antworten in `answers`.
 */
export function aggregateHausaufgaben(
  answers: Answer[],
  template: V8Template
): HausaufgabeItem[] {
  const hygieneBlock = findBlock(template, "hygiene_yes_partial_no");
  if (!hygieneBlock) return [];

  const answerMap = buildAnswerMap(answers);
  const items: HausaufgabeItem[] = [];

  for (const question of hygieneBlock.questions) {
    const value = answerMap.get(question.frage_id);
    if (value !== "nein" && value !== "teilweise") continue;
    items.push({
      frage_id: question.frage_id,
      frage_text: question.text,
      status: value,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// aggregateReflexion
// ---------------------------------------------------------------------------

/**
 * Filtert M10-Antworten (Reflexion-Freitext) mit nicht-leerem Text.
 *
 * Whitespace-only Texte werden als leer behandelt.
 *
 * Reihenfolge der Items folgt der Template-Reihenfolge der M10-Fragen.
 */
export function aggregateReflexion(
  answers: Answer[],
  template: V8Template
): ReflexionItem[] {
  const reflexionBlock = findBlock(template, "reflexion_freitext");
  if (!reflexionBlock) return [];

  const answerMap = buildAnswerMap(answers);
  const items: ReflexionItem[] = [];

  for (const question of reflexionBlock.questions) {
    const value = answerMap.get(question.frage_id);
    if (value === undefined) continue;
    if (value.trim().length === 0) continue;
    items.push({
      frage_id: question.frage_id,
      frage_text: question.text,
      antwort_text: value,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// selectThreeHebel
// ---------------------------------------------------------------------------

/**
 * Waehlt die 3 Module mit den niedrigsten Scores als Hebel-Empfehlungen.
 *
 * Tie-Breaker: bei gleichen Scores wird die Modul-Reihenfolge m1 < m2 < ...
 * < m9 verwendet. Das macht das Resultat ueber wiederholte Aufrufe und
 * verschiedene Sessions deterministisch (kein Bias durch JS-Sort-Stabilitaet
 * bei Objekten).
 *
 * Pro ausgewaehltes Modul wird die Empfehlung aus
 * `stufenLookup[modul_id][stufe].unsere_empfehlung` gezogen, wo `stufe`
 * via `mapModuleScoreToStufe(score)` bestimmt wird.
 */
export function selectThreeHebel(
  moduleScores: ModuleScores,
  stufenLookup: V8StufenLookup,
  modulNames: Record<ModulKey, string>
): HebelItem[] {
  const ranked: { key: ModulKey; score: number; index: number }[] = MODUL_KEYS.map(
    (key, index) => ({
      key,
      score: moduleScores[key],
      index,
    })
  );

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });

  return ranked.slice(0, 3).map(({ key, score }) => {
    const stufe = mapModuleScoreToStufe(score);
    const stufeKey = `s${stufe}` as keyof V8StufenLookup[ModulKey];
    const empfehlung =
      stufenLookup[key]?.[stufeKey]?.unsere_empfehlung ?? "";
    return {
      modul_id: key,
      modul_name: modulNames[key],
      score,
      stufe,
      empfehlung,
    };
  });
}

// ---------------------------------------------------------------------------
// Helper: aggregateStufenMapping (Convenience fuer MT-6)
// ---------------------------------------------------------------------------

/**
 * Convenience-Helper fuer MT-6: mappt ModuleScores komplett auf Stufen 1-5.
 * Wird als `stufenMapping` in den Snapshot geschrieben.
 */
export function mapAllModuleScoresToStufen(
  moduleScores: ModuleScores
): ModuleStufen {
  return {
    m1: mapModuleScoreToStufe(moduleScores.m1),
    m2: mapModuleScoreToStufe(moduleScores.m2),
    m3: mapModuleScoreToStufe(moduleScores.m3),
    m4: mapModuleScoreToStufe(moduleScores.m4),
    m5: mapModuleScoreToStufe(moduleScores.m5),
    m6: mapModuleScoreToStufe(moduleScores.m6),
    m7: mapModuleScoreToStufe(moduleScores.m7),
    m8: mapModuleScoreToStufe(moduleScores.m8),
    m9: mapModuleScoreToStufe(moduleScores.m9),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildAnswerMap(answers: Answer[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of answers) {
    map.set(a.frage_id, a.value);
  }
  return map;
}

function findBlock(
  template: V8Template,
  kind: V8TemplateBlock["answer_schema_kind"]
): V8TemplateBlock | undefined {
  return template.blocks.find((b) => b.answer_schema_kind === kind);
}
