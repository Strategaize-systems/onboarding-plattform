// V10.5 SLC-192 MT-1 — Exit-Report Positionierung (FEAT-109): feste Copy-Konstanten.
//
// Kein Engine-Build, 0 LLM, 0 Migration — reine Positionierungs-Copy, die den Report
// haftungssicher + glaubwuerdig macht (DEC-276):
//   - EXIT_SPUR_COPY        = feste Spur-Definition (was wir bewerten / was ausdruecklich NICHT).
//   - MAKLER_DISCLAIMER_COPY = Datengrundlage-Disclaimer („basiert auf Angaben des Eigentuemers").
// Wording ist Positionierung, KEIN juristisch freigegebener Text (Legal-Review = Folge-Gate
// vor Customer-Live, [[module-lifecycle-discipline]], nicht dieser Slice).

/** Eine benannte Spur-Liste (Ueberschrift + Bullet-Punkte) fuer den Renderer. */
export interface SpurBlock {
  label: string;
  items: readonly string[];
}

/**
 * Spur-Definition des Reports: die operative Verkaufbarkeits-Spur, die dieser Report
 * bewertet — und die Finanz-/Steuer-/Rechts-Spuren, die er ausdruecklich NICHT bewertet.
 */
export const EXIT_SPUR_COPY: {
  eyebrow: string;
  title: string;
  intro: string;
  wasWirBewerten: SpurBlock;
  wasWirNichtBewerten: SpurBlock;
  hinweis: string;
} = {
  eyebrow: "WAS DIESER REPORT BEWERTET",
  title: "Die Spur dieses Reports",
  intro:
    "Ein Unternehmensverkauf hat mehrere Prüf-Spuren. Dieser Report bewertet genau eine davon — " +
    "die operative Verkaufbarkeit. Die finanzielle, steuerliche und rechtliche Spur bleibt bewusst außen vor.",
  wasWirBewerten: {
    label: "Diese Spur bewerten wir",
    items: [
      "Operative Substanz — trägt der Betrieb das Tagesgeschäft auch ohne den Inhaber?",
      "Strukturelle Übertragbarkeit — lassen sich Prozesse, Kunden und Abläufe an einen Nachfolger übergeben?",
      "Owner-Dependence — wie viel Wertsubstanz verlässt das Unternehmen mit dem Eigentümer?",
      "Dokumentiertes Wissen — ist Betriebswissen belegbar oder nur im Kopf des Inhabers?",
    ],
  },
  wasWirNichtBewerten: {
    label: "Diese Spur bewerten wir ausdrücklich NICHT",
    items: [
      "Finanzielle Due Diligence — Bilanzen, GuV, Cash-Flow-Qualität (Spur des Wirtschaftsprüfers).",
      "Steuerliche Strukturierung und steuerrechtliche Bewertung (Spur des Steuerberaters).",
      "Rechtliche Due Diligence — Verträge, Haftung, Gesellschaftsrecht (Spur des Anwalts).",
    ],
  },
  hinweis:
    "Dieser Report ersetzt keine Käufer-Due-Diligence und keine fachliche Prüfung durch Wirtschaftsprüfer, " +
    "Steuerberater oder Anwalt. Er bereitet die operative Verkaufbarkeit vor — nicht die finanzielle oder juristische Prüfung.",
};

/**
 * Makler-/Datengrundlage-Disclaimer: der Report fußt auf der Selbstauskunft des
 * Eigentuemers, nicht auf unabhaengiger Pruefung.
 */
export const MAKLER_DISCLAIMER_COPY: {
  eyebrow: string;
  title: string;
  text: string;
} = {
  eyebrow: "GRUNDLAGE DER BEWERTUNG",
  title: "Hinweis zur Datengrundlage",
  text:
    "Dieser Report basiert ausschließlich auf den Angaben des Eigentümers aus dem Onboarding. " +
    "Die Angaben wurden nicht unabhängig geprüft oder verifiziert. Aussagen zu Substanz, Übertragbarkeit " +
    "und Owner-Dependence spiegeln die Selbstauskunft wider — ein Käufer wird sie in einer eigenen " +
    "Due Diligence gegenprüfen.",
};
