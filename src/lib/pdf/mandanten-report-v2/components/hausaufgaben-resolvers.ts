// V8 SLC-151 MT-3 — Pure-Logic-Helper fuer Hausaufgaben-Page (Page 13).
//
// Resolved den raw HausaufgabeItem[] aus dem Snapshot zu einem
// Render-bereiten HausaufgabeItemRendered[], indem pro Item der
// "Was zu tun"-Fix-Text aus `template.metadata.hausaufgaben_lookup`
// (DEC-161) gezogen wird.
//
// Defensive-Fail-Fast bei Template-Drift (fehlender Lookup-Eintrag),
// damit der Renderer eine klare Error-Message bekommt statt einer leeren
// Sektion oder kryptischem @react-pdf-Crash.

import type { HausaufgabeItem, V8Template } from "@/lib/diagnose/types";

export interface HausaufgabeItemRendered {
  frage_id: string;
  frage_text: string;
  status: "nein" | "teilweise";
  was_zu_tun: string;
}

/**
 * Reichert HausaufgabeItem[] mit dem "Was zu tun"-Fix-Text aus
 * `template.metadata.hausaufgaben_lookup[frage_id][status]` an.
 *
 * Wirft Error bei:
 * - fehlendem template.metadata.hausaufgaben_lookup
 * - fehlendem Lookup-Eintrag fuer eine frage_id
 * - fehlendem oder leerem Fix-Text fuer die status-Variante
 */
export function getHausaufgabenItemsWithErlaeuterung(
  hausaufgaben: HausaufgabeItem[],
  template: V8Template,
): HausaufgabeItemRendered[] {
  const lookup = template.metadata.hausaufgaben_lookup;
  if (!lookup) {
    throw new Error(
      "getHausaufgabenItemsWithErlaeuterung: template.metadata.hausaufgaben_lookup is required",
    );
  }

  return hausaufgaben.map((item) => {
    const fragenLookup = lookup[item.frage_id];
    if (!fragenLookup) {
      throw new Error(
        `getHausaufgabenItemsWithErlaeuterung: hausaufgaben_lookup missing entry for frage_id "${item.frage_id}"`,
      );
    }
    const wasZuTun = fragenLookup[item.status];
    if (!wasZuTun || wasZuTun.trim().length === 0) {
      throw new Error(
        `getHausaufgabenItemsWithErlaeuterung: hausaufgaben_lookup missing fix-text for ${item.frage_id}.${item.status}`,
      );
    }
    return {
      frage_id: item.frage_id,
      frage_text: item.frage_text,
      status: item.status,
      was_zu_tun: wasZuTun,
    };
  });
}
