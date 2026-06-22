// StB-Vertikale Feature-Gate — SLC-171 MT-2 (DEC-239, OP V10).
//
// OP hat kein zentrales featureFlags-Modul; der etablierte Hebel ist ein
// einzelner Env-Flag (vgl. NEXT_PUBLIC_WHISPER_ENABLED). Default OFF
// (module-lifecycle-discipline: V10 bleibt aus, bis Modul 1 vollstaendig ist —
// Internal-Test-Mode, kein Customer-Outreach).

/** Env-Flag-Name fuer die StB-Vertikale (V10). */
export const STB_VERTICAL_ENV_FLAG = "NEXT_PUBLIC_ENABLE_STB_VERTIKALE" as const;

/**
 * True NUR wenn der Env-Flag exakt "true" ist. Fehlend / leer / jeder andere
 * Wert -> false (fail-closed). Wird server-seitig gelesen (das Route-Group-
 * Layout ist eine Server-Component) -> Laufzeit-Read, kein Client-Inlining.
 */
export function isStbVerticalEnabled(): boolean {
  return process.env[STB_VERTICAL_ENV_FLAG] === "true";
}
