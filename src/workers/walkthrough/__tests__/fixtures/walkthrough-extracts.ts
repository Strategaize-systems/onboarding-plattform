// Walkthrough-Test-Fixtures fuer SLC-077 MT-4 / MT-4b / MT-5.
//
// Jede Fixture liefert:
//   - id          stable-Identifier fuer Test-Output
//   - description Kurzbeschreibung der Prozess-Domaene
//   - body        redacted-Walkthrough-Transkript (deutsch, PII-frei)
//   - expectedMinSteps  Recall-Untergrenze fuer Live-Quality-Test (MT-4b, Variante B)
//   - expectedActionPatterns  Regex-Liste, mind. eine Action sollte jedes Pattern matchen
//   - mockBedrockOutput  deterministisches JSON-Array fuer Worker-Mock-Tests (MT-4)
//
// Die Fixtures sind so gewaehlt, dass sie typische Geschaeftsprozesse abbilden:
// Auftragsannahme, Reklamation, Onboarding, Monatsabschluss, Inventur. Plus 1 Edge-Case
// (unstrukturierter Smalltalk → erwartete 0 Schritte, MT-5).

export interface WalkthroughFixture {
  id: string;
  description: string;
  body: string;
  expectedMinSteps: number;
  expectedActionPatterns: RegExp[];
  mockBedrockOutput: string;
}

export const FIXTURE_AUFTRAGSANNAHME: WalkthroughFixture = {
  id: "auftragsannahme",
  description: "Auftragsannahme-Prozess (4 Schritte)",
  body:
    "Also wenn ein neuer Auftrag reinkommt, dann legt erst mal die Buchhaltung den im System an. " +
    "Das macht sie immer bis spaetestens zum Tagesende, weil sonst die Tageskasse nicht stimmt. " +
    "Sobald das angelegt ist, schickt der Vertriebsleiter eine Bestaetigungs-E-Mail an den Kunden — " +
    "das soll die Erwartungshaltung setzen. Danach geht der Auftrag an die Produktion, die ihn " +
    "innerhalb von zwei Werktagen einplant. Die Lieferung wird zum Schluss vom Versand dokumentiert.",
  expectedMinSteps: 3,
  expectedActionPatterns: [
    /(anleg|erfass|System)/i,
    /(Bestaetigung|E-Mail|Mail)/i,
    /(Produktion|einplan|Werkta)/i,
  ],
  mockBedrockOutput: JSON.stringify([
    {
      step_number: 1,
      action: "Auftrag im System anlegen",
      responsible: "Buchhaltung",
      timeframe: "bis Tagesende",
      success_criterion: "Tageskasse stimmt am Tagesende",
      transcript_snippet: "legt erst mal die Buchhaltung den im System an",
    },
    {
      step_number: 2,
      action: "Bestaetigungs-E-Mail an Kunden senden",
      responsible: "Vertriebsleiter",
      success_criterion: "Erwartungshaltung gesetzt",
      dependencies: "Schritt 1 abgeschlossen",
      transcript_snippet: "schickt der Vertriebsleiter eine Bestaetigungs-E-Mail an den Kunden",
    },
    {
      step_number: 3,
      action: "Auftrag in Produktionsplanung einplanen",
      responsible: "Produktion",
      timeframe: "innerhalb von zwei Werktagen",
      dependencies: "Schritt 2 abgeschlossen",
      transcript_snippet: "geht der Auftrag an die Produktion, die ihn innerhalb von zwei Werktagen einplant",
    },
    {
      step_number: 4,
      action: "Lieferung dokumentieren",
      responsible: "Versand",
      transcript_snippet: "Die Lieferung wird zum Schluss vom Versand dokumentiert",
    },
  ]),
};

export const FIXTURE_REKLAMATION: WalkthroughFixture = {
  id: "reklamation",
  description: "Reklamationsbearbeitung (5 Schritte)",
  body:
    "Wenn ein Kunde reklamiert, nimmt das Service-Team zuerst die Reklamation telefonisch oder " +
    "per Mail auf. Dann erstellen sie eine Fehler-Dokumentation im Reklamations-Tool — " +
    "ohne diese Doku bekommt niemand Ersatzteile freigegeben. Anschliessend prueft das Lager, " +
    "ob die Ersatzteile vorraetig sind. Wenn ja, geht der Versand raus, normalerweise am gleichen " +
    "Tag. Zum Schluss schreibt der Kundenservice dem Kunden eine kurze Info-Mail mit Sendungsnummer.",
  expectedMinSteps: 4,
  expectedActionPatterns: [
    /(Reklamation|aufnehm|aufnehmen)/i,
    /(Doku|Fehler-Doku|dokument)/i,
    /(Lager|pruef|pr[uü]f|vorraet|verf[uü]gbar|verfueg)/i,
    /(Versand|verschick|liefer)/i,
  ],
  mockBedrockOutput: JSON.stringify([
    {
      step_number: 1,
      action: "Reklamation aufnehmen",
      responsible: "Service-Team",
      transcript_snippet: "nimmt das Service-Team zuerst die Reklamation telefonisch oder per Mail auf",
    },
    {
      step_number: 2,
      action: "Fehler-Dokumentation im Reklamations-Tool erstellen",
      responsible: "Service-Team",
      success_criterion: "Doku liegt im Reklamations-Tool vor",
      dependencies: "Schritt 1 abgeschlossen",
      transcript_snippet: "erstellen sie eine Fehler-Dokumentation im Reklamations-Tool",
    },
    {
      step_number: 3,
      action: "Ersatzteil-Verfuegbarkeit im Lager pruefen",
      responsible: "Lager",
      dependencies: "Schritt 2 abgeschlossen",
      transcript_snippet: "prueft das Lager, ob die Ersatzteile vorraetig sind",
    },
    {
      step_number: 4,
      action: "Ersatzteile versenden",
      responsible: "Versand",
      timeframe: "am gleichen Tag",
      dependencies: "Schritt 3 (Verfuegbarkeit bestaetigt)",
      transcript_snippet: "geht der Versand raus, normalerweise am gleichen Tag",
    },
    {
      step_number: 5,
      action: "Info-Mail mit Sendungsnummer an Kunden senden",
      responsible: "Kundenservice",
      dependencies: "Schritt 4 abgeschlossen",
      transcript_snippet: "schreibt der Kundenservice dem Kunden eine kurze Info-Mail mit Sendungsnummer",
    },
  ]),
};

export const FIXTURE_ONBOARDING_MITARBEITER: WalkthroughFixture = {
  id: "onboarding-mitarbeiter",
  description: "Mitarbeiter-Onboarding (6 Schritte)",
  body:
    "Wenn ein neuer Mitarbeiter anfaengt, schickt HR eine Woche vor Start die Willkommens-Mappe mit " +
    "den Vertragsunterlagen. Am ersten Arbeitstag empfaengt der Teamleiter den Neuen am Empfang und " +
    "stellt ihn dem Team vor. Die IT richtet noch am Vormittag den Laptop und alle Zugaenge ein. " +
    "Mittags geht der Mentor mit dem Neuen essen — das ist Pflicht in den ersten zwei Wochen, damit " +
    "Fragen unkompliziert geklaert werden. In der ersten Woche absolviert der Neue alle " +
    "Pflicht-Schulungen im Lernportal. Nach 30 Tagen fuehrt der Teamleiter ein erstes Feedback-Gespraech.",
  expectedMinSteps: 4,
  expectedActionPatterns: [
    /(Willkommen|Vertrag|HR)/i,
    /(empfang|vorstell|Team)/i,
    /(IT|Laptop|Zugaenge|einricht)/i,
    /(Schulung|Lernportal)/i,
  ],
  mockBedrockOutput: JSON.stringify([
    {
      step_number: 1,
      action: "Willkommens-Mappe mit Vertragsunterlagen versenden",
      responsible: "HR",
      timeframe: "eine Woche vor Start",
      transcript_snippet: "schickt HR eine Woche vor Start die Willkommens-Mappe mit den Vertragsunterlagen",
    },
    {
      step_number: 2,
      action: "Neuen Mitarbeiter am Empfang begruessen und Team vorstellen",
      responsible: "Teamleiter",
      timeframe: "am ersten Arbeitstag",
      transcript_snippet: "empfaengt der Teamleiter den Neuen am Empfang und stellt ihn dem Team vor",
    },
    {
      step_number: 3,
      action: "Laptop und Zugaenge einrichten",
      responsible: "IT",
      timeframe: "noch am Vormittag des ersten Arbeitstags",
      transcript_snippet: "Die IT richtet noch am Vormittag den Laptop und alle Zugaenge ein",
    },
    {
      step_number: 4,
      action: "Mit Mentor essen gehen",
      responsible: "Mentor",
      timeframe: "in den ersten zwei Wochen, mehrfach",
      success_criterion: "Mentor-Beziehung etabliert",
      transcript_snippet: "geht der Mentor mit dem Neuen essen — das ist Pflicht in den ersten zwei Wochen",
    },
    {
      step_number: 5,
      action: "Pflicht-Schulungen im Lernportal absolvieren",
      responsible: "neuer Mitarbeiter",
      timeframe: "in der ersten Woche",
      transcript_snippet: "absolviert der Neue alle Pflicht-Schulungen im Lernportal",
    },
    {
      step_number: 6,
      action: "Feedback-Gespraech fuehren",
      responsible: "Teamleiter",
      timeframe: "nach 30 Tagen",
      transcript_snippet: "fuehrt der Teamleiter ein erstes Feedback-Gespraech",
    },
  ]),
};

export const FIXTURE_MONATSABSCHLUSS: WalkthroughFixture = {
  id: "monatsabschluss",
  description: "Monatsabschluss Buchhaltung (4 Schritte)",
  body:
    "Am Monatsanfang prueft die Buchhaltung als erstes alle offenen Rechnungen aus dem Vormonat. " +
    "Dann werden die Bankkontoauszuege importiert und mit den Buchungen abgeglichen — " +
    "der Abgleich muss zu 100 Prozent stimmen, sonst wird der Abschluss nicht freigegeben. " +
    "Sobald die Salden stimmen, schreibt die Buchhaltung den Monatsbericht und schickt ihn " +
    "der Geschaeftsfuehrung. Die GF gibt den Bericht innerhalb von drei Werktagen frei oder " +
    "fordert Rueckfragen.",
  expectedMinSteps: 3,
  expectedActionPatterns: [
    /(offen|Rechnung|pruef)/i,
    /(Banko|Kontoauszug|abgleich)/i,
    /(Monatsbericht|Bericht)/i,
  ],
  mockBedrockOutput: JSON.stringify([
    {
      step_number: 1,
      action: "Offene Rechnungen aus Vormonat pruefen",
      responsible: "Buchhaltung",
      timeframe: "am Monatsanfang",
      transcript_snippet: "prueft die Buchhaltung als erstes alle offenen Rechnungen aus dem Vormonat",
    },
    {
      step_number: 2,
      action: "Bankkontoauszuege importieren und mit Buchungen abgleichen",
      responsible: "Buchhaltung",
      success_criterion: "Abgleich stimmt zu 100 Prozent",
      dependencies: "Schritt 1 abgeschlossen",
      transcript_snippet: "werden die Bankkontoauszuege importiert und mit den Buchungen abgeglichen",
    },
    {
      step_number: 3,
      action: "Monatsbericht schreiben und an Geschaeftsfuehrung senden",
      responsible: "Buchhaltung",
      dependencies: "Salden stimmen (Schritt 2)",
      transcript_snippet: "schreibt die Buchhaltung den Monatsbericht und schickt ihn der Geschaeftsfuehrung",
    },
    {
      step_number: 4,
      action: "Bericht freigeben oder Rueckfragen stellen",
      responsible: "Geschaeftsfuehrung",
      timeframe: "innerhalb von drei Werktagen",
      transcript_snippet: "gibt den Bericht innerhalb von drei Werktagen frei oder fordert Rueckfragen",
    },
  ]),
};

export const FIXTURE_INVENTUR: WalkthroughFixture = {
  id: "inventur",
  description: "Lager-Inventur (4 Schritte)",
  body:
    "Einmal im Quartal macht das Lager-Team eine vollstaendige Inventur. Zuerst stoppt der " +
    "Lagerleiter den Wareneingang fuer 24 Stunden, damit nichts dazwischenfunkt. Dann scannen " +
    "zwei Mitarbeiter parallel jede Lagerposition mit dem Handscanner, immer paarweise zur " +
    "Vier-Augen-Kontrolle. Ist alles gescannt, vergleicht das System den Ist-Bestand mit dem " +
    "Soll-Bestand und schreibt eine Differenzliste. Die Geschaeftsfuehrung freigibt die " +
    "Korrekturbuchungen erst nach Sichtprobe an den Top-10 Differenzen.",
  expectedMinSteps: 3,
  expectedActionPatterns: [
    /(Wareneingang|stopp|sperr)/i,
    /(scann|Handscanner|Vier-Augen|paar)/i,
    /(Differenz|Bestand)/i,
  ],
  mockBedrockOutput: JSON.stringify([
    {
      step_number: 1,
      action: "Wareneingang fuer 24 Stunden stoppen",
      responsible: "Lagerleiter",
      timeframe: "einmal im Quartal",
      success_criterion: "kein Wareneingang waehrend Inventur",
      transcript_snippet: "stoppt der Lagerleiter den Wareneingang fuer 24 Stunden",
    },
    {
      step_number: 2,
      action: "Lagerpositionen paarweise mit Handscanner scannen (Vier-Augen-Kontrolle)",
      responsible: "Lager-Team (zwei Mitarbeiter)",
      success_criterion: "alle Positionen erfasst",
      dependencies: "Schritt 1 abgeschlossen",
      transcript_snippet: "scannen zwei Mitarbeiter parallel jede Lagerposition mit dem Handscanner, immer paarweise zur Vier-Augen-Kontrolle",
    },
    {
      step_number: 3,
      action: "Ist-Bestand mit Soll-Bestand vergleichen und Differenzliste erstellen",
      responsible: "System",
      dependencies: "Schritt 2 abgeschlossen",
      transcript_snippet: "vergleicht das System den Ist-Bestand mit dem Soll-Bestand und schreibt eine Differenzliste",
    },
    {
      step_number: 4,
      action: "Korrekturbuchungen nach Sichtprobe Top-10 Differenzen freigeben",
      responsible: "Geschaeftsfuehrung",
      success_criterion: "Sichtprobe erledigt",
      transcript_snippet: "freigibt die Korrekturbuchungen erst nach Sichtprobe an den Top-10 Differenzen",
    },
  ]),
};

// Edge-Case N=0 — unstrukturierter Smalltalk, kein Prozess erkennbar.
export const FIXTURE_UNSTRUKTURIERT: WalkthroughFixture = {
  id: "unstrukturiert",
  description: "Edge-Case unstrukturierter Smalltalk (0 Schritte)",
  body:
    "Also ja, das ist halt schwierig zu erklaeren. Manchmal machen wir das so, manchmal anders. " +
    "Kommt drauf an. Bei [KUNDE] war das letzte Woche zum Beispiel ganz anders. Aber im Normalfall " +
    "weiss jeder, was er zu tun hat. Wir sind ein gutes Team.",
  expectedMinSteps: 0,
  expectedActionPatterns: [],
  mockBedrockOutput: "[]",
};

export const ALL_STRUCTURED_FIXTURES: WalkthroughFixture[] = [
  FIXTURE_AUFTRAGSANNAHME,
  FIXTURE_REKLAMATION,
  FIXTURE_ONBOARDING_MITARBEITER,
  FIXTURE_MONATSABSCHLUSS,
  FIXTURE_INVENTUR,
];

export const ALL_FIXTURES: WalkthroughFixture[] = [
  ...ALL_STRUCTURED_FIXTURES,
  FIXTURE_UNSTRUKTURIERT,
];
