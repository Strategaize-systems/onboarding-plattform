// V9.5 SLC-V9.5-C MT-1 — Bounded-Critic System-Prompt + Versions-Anker
//
// Slice: slices/SLC-V9.5-C-bounded-critic-gate.md (MT-1)
// Feature: FEAT-081  DEC: DEC-216 (1 Synthese + 1 Critic, bounded, kein
//          Konvergenz-Loop; accept KEEP && evidence_count>=2)
//
// Quelle: ARCHITECTURE.md §"V9.5 Architecture Addendum" §7 (Critic-Prompt-
//   Entwurf). Frisch entworfen — Prinzip-Reuse aus email-synthesis-prompt.ts
//   (Strict-JSON, Versions-Anker), KEIN Code-1:1.
//
// R-C-1 (Over-Reject): Prompt ist bewusst konservativ — REJECT nur bei klarem
// Trivial-/Halluzinations-/Redundanz-Befund oder evidence_count < 2. Im
// Zweifel KEEP; die harte evidence>=2-Schwelle filtert zusaetzlich im Worker.

/**
 * Prompt-Version Anker — analog V95_SYNTHESIS_PROMPT_VERSION, fuer
 * Cache-Invalidation / A/B-Tests in spaeteren V9.x.
 */
export const V95_CRITIC_PROMPT_VERSION = "v1.0.0-2026-06-12";

/**
 * System-Prompt fuer den bounded Sonnet-Critic-Pass (genau 1 Call pro Run).
 * Striktes JSON-Output-Format — nur Urteil + knappe Begruendung, KEINE
 * Umformulierung der Units.
 */
export const V95_CRITIC_SYSTEM_PROMPT = [
  "Du bist ein KRITISCHER PRUEFER konsolidierter Handbuch-Bausteine (Units). Du erhaeltst die synthetisierten Units eines Laufs und gibst pro Unit genau EIN Verdict ab. Du formulierst NICHTS um — nur Urteil + knappe Begruendung.",
  "",
  "**Verdict-Regeln:**",
  "`REJECT` NUR wenn mindestens eines KLAR zutrifft:",
  "1. Trivial — die Unit traegt keine geschaeftsrelevante Information (z.B. reine Hoeflichkeitsfloskel, Selbstverstaendlichkeit).",
  "2. Nicht belegt (Halluzination) — die `description` wird durch die mitgelieferten `evidence_snippets` NICHT gestuetzt.",
  "3. Redundant — die Unit wiederholt inhaltlich eine ANDERE Unit derselben Liste (verweise in `reason` auf deren `unit_ref`).",
  "4. `evidence_count` < 2 — die Unit ist nur einfach belegt.",
  "Sonst `KEEP`. Im Zweifel KEEP — verwirf NICHT wegen Stil, Kuerze oder konservativem Merge.",
  "",
  "**Output-Format — STRIKT JSON, NICHTS DRUMHERUM:**",
  "```",
  "{",
  '  "verdicts": [',
  '    { "unit_ref": 0, "verdict": "KEEP", "reason": "..." },',
  '    { "unit_ref": 1, "verdict": "REJECT", "reason": "..." }',
  "  ]",
  "}",
  "```",
  "",
  "**WICHTIG:** `unit_ref` ist der 0-basierte Index der Unit in der Eingabe-Liste. Gib fuer JEDE Eingabe-Unit genau ein Verdict ab. Antworte AUSSCHLIESSLICH mit dem JSON-Objekt — keine Markdown-Codeblocks, keine Erklaerung. Beginne mit `{` und ende mit `}`.",
].join("\n");

/**
 * Kompakte Critic-Eingabe-Unit: die curierbaren Felder einer Draft-Unit +
 * die REKONZILIIERTE evidence_count (der Worker setzt sie aus den gegen die
 * echten Input-Pattern-IDs gefilterten Belegen — nicht der LLM-Rohwert).
 */
export interface CriticInputUnit {
  title: string;
  description: string;
  themes: string[];
  suggested_section: string;
  evidence_count: number;
  evidence_snippets: Array<{ text: string; source_pattern_id: string }>;
}

/**
 * Baut den User-Prompt: JSON-Array aller Draft-Units mit explizitem
 * `unit_ref`-Index, damit das Verdict-Mapping deterministisch ist.
 */
export function buildCriticUserPrompt(units: CriticInputUnit[]): string {
  const compact = units.map((u, idx) => ({
    unit_ref: idx,
    title: u.title,
    description: u.description,
    themes: u.themes,
    suggested_section: u.suggested_section,
    evidence_count: u.evidence_count,
    evidence_snippets: u.evidence_snippets,
  }));

  const lines: string[] = [];
  lines.push(`Anzahl zu pruefender Units: ${units.length}`);
  lines.push("");
  lines.push("Units (JSON-Array, unit_ref = Index):");
  lines.push(JSON.stringify(compact, null, 2));
  lines.push("");
  lines.push(
    "Gib fuer jede Unit genau ein Verdict im vorgegebenen Strict-JSON-Format. " +
      "Beginne mit `{` und beende mit `}`.",
  );
  return lines.join("\n");
}
