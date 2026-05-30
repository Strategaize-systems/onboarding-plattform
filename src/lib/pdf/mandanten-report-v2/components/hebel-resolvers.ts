// V8 SLC-151 MT-4 — Pure-Logic-Helper fuer 3-Strategie-Hebel-Page (Page 14).
//
// formatHebelBlock(hebelItem, index) reichert ein rohes HebelItem aus dem
// Snapshot um Render-Metadaten an (Prioritaet 1..3 abgeleitet aus Index,
// Modul-Nummer aus modul_id, formatierter Modul-Ref-String).
//
// HebelItem.empfehlung kommt aus stufen_lookup[modul][stufe].unsere_empfehlung
// (DEC-160) und wird 1:1 als Body-Text gerendert.

import type { HebelItem, ModulKey } from "@/lib/diagnose/types";

export type HebelPriority = 1 | 2 | 3;

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

const PRIORITY_LABELS: Record<HebelPriority, string> = {
  1: "Kritisch",
  2: "Wichtig",
  3: "Schneller Hebel",
};

export interface HebelBlockRendered {
  /** 1 = Prio-1 (rot, hoechste Prio), 2 = amber, 3 = brand-primary. */
  priority: HebelPriority;
  /** Display-Label hinter Badge ("Kritisch" / "Wichtig" / "Schneller Hebel"). */
  priorityLabel: string;
  /** Header-Ref-String: "Modul 4 · Score 2/10". */
  modulRef: string;
  /** Modul-Name aus HebelItem (z.B. "Vertrieb & Kunden"). */
  modulName: string;
  /** Empfehlungs-Text aus stufen_lookup. */
  empfehlung: string;
}

/**
 * Wandelt ein rohes HebelItem aus dem Snapshot in Render-bereite Display-Daten.
 *
 * Defensive: wirft Error bei
 * - index ausserhalb 0..2 (HebelPage nimmt nur 3 Hebel an)
 * - unbekanntem modul_id (nicht in m1..m9)
 * - leerem empfehlung-Text (Template-Drift)
 * - leerem modul_name (Snapshot-Drift)
 */
export function formatHebelBlock(
  hebelItem: HebelItem,
  index: number,
): HebelBlockRendered {
  if (index < 0 || index > 2) {
    throw new Error(
      `formatHebelBlock: index ${index} out of range (HebelPage rendert nur 3 Bloecke 0..2)`,
    );
  }
  if (!MODUL_KEYS.includes(hebelItem.modul_id)) {
    throw new Error(
      `formatHebelBlock: invalid modul_id "${hebelItem.modul_id}"`,
    );
  }
  if (!hebelItem.modul_name || hebelItem.modul_name.trim().length === 0) {
    throw new Error(
      `formatHebelBlock: empty modul_name for ${hebelItem.modul_id}`,
    );
  }
  if (!hebelItem.empfehlung || hebelItem.empfehlung.trim().length === 0) {
    throw new Error(
      `formatHebelBlock: empty empfehlung for ${hebelItem.modul_id}`,
    );
  }

  const priority = (index + 1) as HebelPriority;
  const modulNumber = MODUL_KEYS.indexOf(hebelItem.modul_id) + 1;
  const modulRef = `Modul ${modulNumber} · Score ${hebelItem.score}/10`;

  return {
    priority,
    priorityLabel: PRIORITY_LABELS[priority],
    modulRef,
    modulName: hebelItem.modul_name,
    empfehlung: hebelItem.empfehlung,
  };
}

/**
 * Bequemlichkeits-Wrapper: formattiert eine ganze Hebel-Liste mit
 * index-basierten Prioritaeten. Wirft Error wenn nicht genau 3 Items
 * uebergeben werden — die HebelPage rendert genau 3 Bloecke.
 */
export function formatAllHebelBlocks(
  hebel: HebelItem[],
): HebelBlockRendered[] {
  if (hebel.length !== 3) {
    throw new Error(
      `formatAllHebelBlocks: expected exactly 3 hebel items, got ${hebel.length}`,
    );
  }
  return hebel.map((item, idx) => formatHebelBlock(item, idx));
}
