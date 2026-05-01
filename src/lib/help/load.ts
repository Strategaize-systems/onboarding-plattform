// SLC-050 — Server-side Help-Markdown-Loader.
//
// Liest statische Markdown-Files aus src/content/help/ zur Server-Render-Zeit.
// Next.js Server Components cachen das Ergebnis pro Request, kein Re-Read pro
// Sheet-Open. Bewusst synchron (readFileSync) — die Files sind klein, lokal,
// und werden nur waehrend SSR gelesen.

import { readFileSync } from "fs";
import { join } from "path";

const HELP_DIR = join(process.cwd(), "src/content/help");
const VALID_KEYS = [
  "dashboard",
  "capture",
  "bridge",
  "reviews",
  "handbook",
] as const;

export type HelpPageKey = (typeof VALID_KEYS)[number];

export function loadHelpMarkdown(pageKey: HelpPageKey): string {
  if (!VALID_KEYS.includes(pageKey)) {
    throw new Error(`Unknown help page key: ${pageKey}`);
  }
  return readFileSync(join(HELP_DIR, `${pageKey}.md`), "utf-8");
}

export function listAvailableHelpPages(): readonly HelpPageKey[] {
  return VALID_KEYS;
}
