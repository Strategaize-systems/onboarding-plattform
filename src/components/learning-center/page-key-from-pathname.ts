// SLC-055 — URL-Pfad → HelpPageKey-Mapping (DEC-064 Variante 3).
//
// Wird von HelpButton/LearningCenterPanel verwendet, um den richtigen Help-
// Markdown-Inhalt fuer den "Diese Seite"-Tab zu laden. Mapping deckt die 5
// Help-Files aus SLC-050 ab. Unbekannte Pfade liefern null — das LC zeigt
// dann den Fallback-Banner ("noch kein Hilfe-Artikel").

import type { HelpPageKey } from "@/lib/help/load";

export type PageKeyResult = HelpPageKey | null;

export function pageKeyFromPathname(pathname: string): PageKeyResult {
  if (!pathname) return null;

  // Normalize: strip query, hash, locale-prefix (/de, /en, /nl)
  const path = pathname.split("?")[0].split("#")[0].replace(/^\/(de|en|nl)(?=\/|$)/, "");

  if (path === "/dashboard" || path === "/dashboard/") {
    return "dashboard";
  }
  if (path.startsWith("/dashboard/capture") || path.startsWith("/capture/")) {
    return "capture";
  }
  if (path.startsWith("/dashboard/handbook") || path.startsWith("/admin/blocks/")) {
    // /admin/blocks/<key>/review gehoert thematisch zu Reviews, daher zuerst Reviews-Check.
    if (path.includes("/review")) {
      return "reviews";
    }
    if (path.startsWith("/dashboard/handbook")) {
      return "handbook";
    }
  }
  if (path.startsWith("/admin/bridge")) {
    return "bridge";
  }
  if (path.startsWith("/admin/reviews") || path.startsWith("/admin/blocks/")) {
    return "reviews";
  }

  return null;
}
