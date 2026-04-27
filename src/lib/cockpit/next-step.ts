import type { CockpitMetrics, NextStep } from "./types";

/**
 * SLC-040 MT-4 — Regel-basierte Empfehlungs-Logik fuer das Status-Cockpit.
 *
 * Pure function. Reihenfolge der Regeln entspricht dem natuerlichen Flow:
 *   1. Keine GF-Session       -> "Neue Erhebung starten"
 *   2. Bloecke unvollstaendig -> "Block fortsetzen"
 *   3. Bridge fehlt/stale/failed -> "Bridge ausfuehren"
 *   4. Keine Mitarbeiter      -> "Mitarbeiter einladen"
 *   5. Mitarbeiter-Aufgaben offen -> "Mitarbeiter erinnern (manuell)"
 *   6. Handbuch fehlt/failed  -> "Unternehmerhandbuch generieren"
 *   7. Handbuch generating    -> "Wird erzeugt — kurz warten"
 *   8. Handbuch ready         -> "Onboarding abgeschlossen"
 *
 * Wichtig: Das ist die V4 Foundation-Logik. KI-gestuetzte Empfehlungen
 * (V5+) sind out of scope.
 */
export function computeRecommendedNextStep(metrics: CockpitMetrics): NextStep {
  if (!metrics.captureSessionId) {
    return {
      label: "Neue Erhebung starten",
      href: "/capture/new",
      reason: "Du hast noch keine eigene Erhebung. Lege jetzt los.",
    };
  }

  if (metrics.blocksSubmitted < metrics.blocksTotal) {
    const remaining = Math.max(0, metrics.blocksTotal - metrics.blocksSubmitted);
    return {
      label: remaining === metrics.blocksTotal ? "Ersten Block starten" : "Block fortsetzen",
      href: `/capture/${metrics.captureSessionId}`,
      reason: `${remaining} von ${metrics.blocksTotal} Bloecken sind noch offen.`,
    };
  }

  // Alle Bloecke submitted ab hier.
  const bridge = metrics.lastBridgeRun;
  if (!bridge || bridge.status === "stale" || bridge.status === "failed") {
    const reason = !bridge
      ? "Alle Bloecke sind eingereicht. Lass die Bridge-Engine Folge-Aufgaben fuer dein Team vorschlagen."
      : bridge.status === "stale"
        ? "Deine Antworten haben sich geaendert — der letzte Bridge-Lauf ist veraltet. Bitte aktualisieren."
        : "Der letzte Bridge-Lauf ist fehlgeschlagen. Bitte erneut starten.";
    return {
      label: bridge ? "Bridge erneut ausfuehren" : "Bridge ausfuehren",
      href: "/admin/bridge",
      reason,
    };
  }

  if (bridge.status === "running") {
    return {
      label: "Bridge laeuft — kurz warten",
      href: "/admin/bridge",
      reason: "Die Bridge-Engine erzeugt gerade Vorschlaege. Typischerweise 30-60 Sekunden.",
    };
  }

  // bridge.status === "completed" ab hier.
  if (metrics.employeesInvited === 0) {
    return {
      label: "Mitarbeiter einladen",
      href: "/admin/team",
      reason: "Bridge hat Vorschlaege erzeugt. Lade jetzt Mitarbeiter ein, damit du Aufgaben verteilen kannst.",
    };
  }

  if (metrics.employeeTasksOpen > 0) {
    return {
      label: "Mitarbeiter erinnern (manuell)",
      href: "/admin/team",
      reason: `${metrics.employeeTasksOpen} Mitarbeiter-Aufgabe(n) sind noch offen. Erinnere die Personen direkt — automatische Reminder kommen in V4.2.`,
    };
  }

  // Alle Mitarbeiter-Aufgaben fertig.
  const handbook = metrics.lastHandbookSnapshot;
  if (!handbook || handbook.status === "failed") {
    return {
      label: !handbook ? "Unternehmerhandbuch generieren" : "Handbuch erneut generieren",
      href: "/admin/handbook",
      reason: !handbook
        ? "Alle Inhalte stehen. Erzeuge dein konsolidiertes Markdown-Paket."
        : "Die letzte Handbuch-Generierung ist fehlgeschlagen. Bitte erneut starten.",
    };
  }

  if (handbook.status === "generating") {
    return {
      label: "Handbuch wird erzeugt — kurz warten",
      href: "/admin/handbook",
      reason: "Das Markdown-Paket wird im Hintergrund erzeugt. Typischerweise unter 30 Sekunden.",
    };
  }

  return {
    label: "Onboarding abgeschlossen",
    href: "/admin/handbook",
    reason: "Alle Bausteine sind fertig. Lade das Handbuch oder starte eine neue Erhebung.",
  };
}
