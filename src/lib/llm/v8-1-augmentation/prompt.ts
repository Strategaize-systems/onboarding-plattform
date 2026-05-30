// V8.1 LLM-Augmentation — System-Prompt + Tonality-Blacklist + Word-Counter
//
// Slice: SLC-161 MT-1
// Spec: slices/SLC-161-llm-augmentation-backend.md
// DEC-167: Cache-Key enthaelt V8_1_PROMPT_VERSION — bei System-Prompt-Aenderung Version hochziehen.
// DEC-175: ENV BEDROCK_V8_1_MODEL_ID liefert Modell, Cache-Invalidation automatisch.

/**
 * Prompt-Version-Konstante fuer Cache-Tuple-Key (DEC-167).
 * MUSS bei jeder inhaltlichen Aenderung von V8_1_SYSTEM_PROMPT hochgezogen werden.
 */
export const V8_1_PROMPT_VERSION = "v1";

/**
 * Maximale Wort-Anzahl pro LLM-augmentiertem Empfehlungs-Text.
 * Ueberschreitung → Fallback auf deterministischen V8.0-Stufen-Text (slice AC-SLC-161-6).
 */
export const V8_1_MAX_WORD_COUNT = 80;

/**
 * Strategaize-Wir-Voice-System-Prompt fuer V8.1 Outro-Empfehlungs-Texte.
 * Erzeugt 2-3 Saetze, max 80 Worte, verkaufsorientiert ohne Pricing,
 * adressiert den Mandanten direkt aus Strategaize-Perspektive.
 */
export const V8_1_SYSTEM_PROMPT = `Du bist Strategaize, ein Beratungs-Team fuer Unternehmens-Uebergaben (Exit-Readiness, M&A, Nachfolge).

DEINE AUFGABE:
Formuliere fuer den Mandanten eine kurze, konkrete Empfehlung zu einem identifizierten Hebel-Modul. Die Empfehlung erklaert in der Strategaize-Wir-Voice, was wir gemeinsam mit dem Mandanten in diesem Modul tun koennten, um seine Uebergabe-Reife zu steigern.

TONALITAET-PFLICHT:
- Strategaize-Wir-Voice: "Wir empfehlen", "Wir sehen", "Lassen Sie uns" — NIEMALS "ich", "mein Team", "der Founder", "Founders"
- Verkaufsorientiert: das Ziel ist Vertrauen und Bereitschaft zu einem Folgegespraech
- Konkret: nenne, was im Modul konkret angegangen werden koennte (nicht "alles")
- Adressiere den Mandanten mit "Sie" (formell)

VERBOTENES VOKABULAR:
- Keine Pricing-Hinweise: keine Preise, keine Kosten, kein "Euro", kein "EUR"
- Keine Ich-Form, keine Erwaehnung einzelner Personen
- Keine ueberhebliche Sprache ("perfekt", "garantiert"), keine Glueckwunsch-Floskeln

FORMAT-PFLICHT:
- Exakt 2-3 Saetze
- Maximal 80 Worte
- Kein Markdown, keine Aufzaehlung, keine Ueberschriften
- Klartext, fliessende Prosa

OUTPUT:
Antworte ausschliesslich mit dem Empfehlungs-Text selbst — keine Vorrede, kein "Hier ist die Empfehlung", keine Anfuehrungszeichen.`;

/**
 * Blacklist-Patterns fuer Post-Validation des LLM-Outputs.
 * Treffer → Fallback auf deterministischen V8.0-Stufen-Text (slice AC-SLC-161-5).
 *
 * Wort-Boundary `\b` fuer "ich" verhindert False-Positives auf "individuell",
 * "wichtig", "leiblich", "menschlich" etc.
 */
export const V8_1_TONALITY_BLACKLIST: readonly RegExp[] = [
  /\bich\b/i,
  /mein Team/i,
  /der Founder/i,
  /Founders/i,
  /wir empfehlen Ihnen/i,
  /\bEuro\b/i,
  /\bEUR\b/i,
  /\bKosten\b/i,
  /\bPreis\b/i,
] as const;

/**
 * Prueft ob ein LLM-Output gegen die Tonality-Blacklist verstoesst.
 * Verwendet in augment.ts MT-4 als Post-Validation-Gate.
 */
export function containsBlacklistedPattern(text: string): boolean {
  return V8_1_TONALITY_BLACKLIST.some((pattern) => pattern.test(text));
}

/**
 * Zaehlt Worte in einem Text. Whitespace-getrennt, multiple Whitespaces
 * werden als einzelner Separator behandelt, leading/trailing Whitespace ignoriert.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
