// Pattern aus strategaize-business-system/cockpit/src/lib/auth/password-policy.ts
// (P-088 / Rule: strategaize-pattern-reuse.md) — V10.3 SLC-186 MT-2 (DEC-266)
/**
 * Zentrale Passwort-Policy (12+ Hard-Floor + zxcvbn-Score >= 3).
 *
 * Gilt NUR fuer NEU gesetzte Passwoerter (set-password + accept-invitation).
 * Bestands-User + Login (signInWithPassword) bleiben unangetastet.
 *
 * Bundle-Mitigation: zxcvbn (~800KB) wird via dynamic import() geladen,
 *   damit es als Lazy-Chunk und NICHT im Main-Bundle landet.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MIN_SCORE = 3;

export interface PasswordStrengthResult {
  /** true, wenn Hard-Floor (Laenge) UND Score-Threshold erfuellt sind */
  ok: boolean;
  /** zxcvbn-Score 0-4. 0, wenn unter Mindestlaenge (dann nicht gemessen). */
  score: number;
  /** Maschinen-lesbare Gruende: "min_length" | "weak_strength". Leer wenn ok. */
  reasons: string[];
}

/**
 * Prueft ein NEU zu setzendes Passwort gegen die Policy.
 * Async, weil zxcvbn lazy via dynamic import() geladen wird (Bundle-Mitigation).
 */
export async function validatePasswordStrength(
  password: string,
): Promise<PasswordStrengthResult> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, score: 0, reasons: ["min_length"] };
  }

  const { default: zxcvbn } = await import("zxcvbn");
  const { score } = zxcvbn(password);

  if (score < PASSWORD_MIN_SCORE) {
    return { ok: false, score, reasons: ["weak_strength"] };
  }

  return { ok: true, score, reasons: [] };
}
