import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_SCORE,
} from "../password-policy";

/**
 * V10.3 SLC-186 MT-2 (DEC-266) — Passwort-Policy (P-088).
 * Port aus strategaize-business-system/cockpit. Echtes zxcvbn (node-env),
 * kein Mock — die Policy ist der Vertrag, den wir hier verifizieren.
 */

describe("validatePasswordStrength", () => {
  it("lehnt Passwoerter unter Mindestlaenge ab (min_length, score 0)", async () => {
    const result = await validatePasswordStrength("kurz");
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["min_length"]);
    expect(result.score).toBe(0);
  });

  it("lehnt 12+ Zeichen langes aber schwaches Passwort ab (weak_strength)", async () => {
    const result = await validatePasswordStrength("aaaaaaaaaaaa");
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["weak_strength"]);
    expect(result.score).toBeLessThan(PASSWORD_MIN_SCORE);
  });

  it("akzeptiert ein starkes Passwort (ok=true, keine reasons)", async () => {
    const result = await validatePasswordStrength("kX9#mP2$vL8@qR5!");
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(PASSWORD_MIN_SCORE);
  });

  it("liefert einen plausiblen Score im Bereich 0-4", async () => {
    const result = await validatePasswordStrength("aaaaaaaaaaaa");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it("akzeptiert ein exakt 12 Zeichen langes starkes Passwort", async () => {
    const pw = "kX9#mP2$vL8@";
    expect(pw.length).toBe(PASSWORD_MIN_LENGTH);
    const result = await validatePasswordStrength(pw);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});
