// V7.1 SLC-137 MT-1 — EditableText pure-logic helpers (FEAT-056).
//
// Reine Helper-Funktionen ohne React-DOM-Abhaengigkeiten, damit Vitest sie im
// node-env testen kann. Die UI-Komponente in EditableText.tsx ruft diese
// Helper auf und bleibt selbst eine duenne React-Schale.
//
// Architecture-Anker: docs/ARCHITECTURE.md V7.1 EditableText-Konsum.
// Foundation: src/lib/text-override/resolver.ts (Map-Lookup), actions.ts (Save).

import type { TextOverrideScope } from "@/lib/text-override/resolver";
import type { UserRole } from "@/types/db";

/**
 * Rollen mit Edit-Recht auf Text-Overrides. Spiegelt EDITOR_ROLES in
 * actions.ts — Server-side ist die Source of Truth. Diese Liste hier ist
 * ein UI-Vorab-Filter (Pencil-Icon visible yes/no). Wer Pencil sieht aber
 * keine Server-Auth hat, scheitert beim Save mit "forbidden".
 */
export const EDITOR_ROLES: ReadonlyArray<UserRole> = [
  "strategaize_admin",
  "partner_admin",
];

/**
 * Schwelle aus DEC-143: bis 80 Zeichen Default-Text + nicht multiline ->
 * Inline-Editor; sonst Modal mit grosser Textarea.
 */
export const INLINE_EDIT_MAX_LEN = 80;

export type EditorMode = "inline" | "modal";

/**
 * Bestimmt, ob die Rolle das Pencil-Icon sehen darf.
 *
 * Pure function — kein React-Context-Touch.
 */
export function canEditText(role: UserRole | null | undefined): boolean {
  if (!role) return false;
  return (EDITOR_ROLES as ReadonlyArray<UserRole>).includes(role);
}

/**
 * Waehlt den Editor-Mode anhand DEC-143-Hybrid-Schwelle.
 *
 *  - multiline=true             -> immer Modal (gross-Textarea-Pflicht)
 *  - defaultText > 80 chars     -> Modal (Inline wuerde abschneiden)
 *  - sonst                      -> Inline
 *
 * Pure function — Tests koennen direkt Wert + Mode-Mapping verifizieren.
 */
export function pickEditorMode(
  defaultText: string,
  multiline: boolean,
): EditorMode {
  if (multiline) return "modal";
  if (defaultText.length > INLINE_EDIT_MAX_LEN) return "modal";
  return "inline";
}

/**
 * Schlaegt den Effective-Text aus der Override-Map nach mit Fallback auf
 * defaultText.
 *
 * Lokale Hilfsfunktion damit die UI-Komponente nicht direkt das Resolver-Map
 * sieht — vereinfacht Mocking in Tests und entkoppelt von resolver.ts.
 */
export function selectEffectiveText(
  map: ReadonlyMap<string, string> | null | undefined,
  keyPath: string,
  defaultText: string,
): { text: string; isOverride: boolean } {
  if (!map) return { text: defaultText, isOverride: false };
  const override = map.get(keyPath);
  if (typeof override === "string") {
    return { text: override, isOverride: true };
  }
  return { text: defaultText, isOverride: false };
}

/**
 * Validierungs-Regel fuer das text_key-Pattern; identisch zu actions.ts
 * TEXT_KEY_REGEX. Hier exportiert, damit der UI-Layer optional einen
 * Hinweis liefern kann (z.B. wenn ein Developer einen Bad-Key in einem
 * EditableText-Aufruf setzt).
 */
export const TEXT_KEY_REGEX = /^[a-z0-9._]{1,200}$/;

export function isValidTextKey(key: string): boolean {
  return TEXT_KEY_REGEX.test(key);
}

/**
 * Default-Scope-Konvention pro Key-Praefix:
 *   - template.*  -> 'template'
 *   - partner.*   -> 'partner' (V7.2+, V7.1 ungenutzt)
 *   - sonst       -> 'global'
 *
 * Pure function — Tests koennen Default-Scope pro Key-Form pruefen.
 */
export function defaultScopeForKey(keyPath: string): TextOverrideScope {
  if (keyPath.startsWith("template.")) return "template";
  if (keyPath.startsWith("partner.")) return "partner";
  return "global";
}
