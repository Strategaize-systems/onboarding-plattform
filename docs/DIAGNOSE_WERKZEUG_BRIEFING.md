# Inhalts-Workshop Diagnose-Werkzeug — Briefing fuer externe Ausarbeitung

**Zweck:** Dieses Dokument ist das vollstaendige Briefing, das du an einen externen Sparringspartner (ChatGPT, Berater, Workshop-Teilnehmer) gibst. Der Output dieses Workshops loest `BL-095` und entsperrt `/backend SLC-105` (FEAT-045 Diagnose-Werkzeug).

**Status:** open — wartet auf Workshop-Output
**Verantwortlich:** User (Immo)
**Stop-Gate fuer:** SLC-105 Light-Condensation-Pipeline + Bericht-Renderer
**Erstellt:** 2026-05-16

---

## TEIL 1 — KONTEXT FUER CHATGPT (copy-paste ans Modell)

> Du bist Sparringspartner fuer eine Workshop-Ausarbeitung. Lies den folgenden Kontext und liefere am Ende exakt das Output-Format aus Teil 4 dieses Dokuments — nichts anderes, kein Kommentar drumherum.

### Was wird gebaut

Ein **Strategaize-Diagnose-Werkzeug** als schlankes Self-Service-Assessment fuer Mittelstands-Unternehmer (typisch GmbH-Geschaeftsfuehrer, 10-200 Mitarbeiter). Steuerberater verteilen das Werkzeug an ihre Mandanten unter Co-Branding ("Ihr Steuerberater empfiehlt das"). Der Mandant durchlaeuft das Werkzeug allein in 15-25 Minuten, ohne menschlichen Berater-Loop, ohne Sales-Druck, ohne Vertriebs-Anruf danach (es sei denn er klickt aktiv "Ich will mehr").

### Was es misst

**Wie strukturiert ist die Firma heute, und wie weit weg ist sie davon, KI sinnvoll einzusetzen?** Es ist keine KI-Tool-Demo, keine GPT-Spielwiese, kein Sales-Funnel — eine ehrliche Standortbestimmung.

### Was am Ende rauskommt

Ein persoenlicher Bericht mit:
- **Score pro Baustein (0-100)** — deterministisch aus den Antworten berechnet (KEIN KI-Output, sondern feste Mapping-Regel)
- **2-3 Saetze KI-Kommentar pro Baustein** — was faellt auf, was ist die groesste Luecke, was waere realistische naechste Verbesserung
- **Pflicht-Output-Aussage am Ende** — ein einheitlicher Schluss-Satz, der Druck und Hoffnung gleichzeitig erzeugt:
  > "Wir sind noch nicht bereit, KI strukturiert einzusetzen. Wir haben offene Flanken, wir muessen Hausaufgaben machen. Aber wenn wir die Zeit dafuer nehmen, wird KI ein echter Faktor in unserem Unternehmen sein."

### Tone & Style

- **Direkt, ehrlich, ohne Beratersprech.** Kein "Wir denken, dass eventuell moeglicherweise ...", sondern "Wenn X fehlt, dann passiert Y."
- **Keine Schmeichelei.** "Sie sind nicht ready" ist ein erlaubter und gewollter Output.
- **Mittelstands-Sprache.** Kein KI-Hype-Vokabular ("Disruption", "Synergien", "Transformation"). Stattdessen: konkrete Begriffe aus dem Geschaeftsalltag (Vertrieb, Auftragsabwicklung, Reklamation, Urlaubsvertretung, Reporting).
- **Diskussions-anregend.** Fragen sollen den Mandanten zum Nachdenken bringen, nicht nur Ja/Nein abklappern. Aber: trotzdem deterministisch auswertbar (siehe Score-Logik unten).
- **Keine Schadenfreude.** Auch wenn der Score schlecht ist: respektvoller, partnerschaftlicher Ton. "Das ist die Realitaet vieler Mittelstaendler" statt "Sie sind hinten dran."

### Strategische Mechanik (warum es so funktionieren muss)

Das Werkzeug ist der **Sales-Motor ohne Sales-Druck**: Der Mandant erkennt sein eigenes Problem ("wir muessen ran"), Strategaize liefert spaeter die Loesung. Der Bericht muss daher **ehrlich genug sein, um vertrauenswuerdig zu wirken**, und **strukturiert genug, um die Notwendigkeit professioneller Strukturierung sichtbar zu machen**. Kein KI-generischer Wischi-Waschi-Bericht — sonst brennt er Vertrauen ab beim Steuerberater UND beim Mandanten.

---

## TEIL 2 — DIE 6 BAUSTEINE (Pflicht-Struktur)

Die Bausteine sind aus dem Multiplikator-Modell festgelegt. **Nicht aendern, nicht hinzufuegen, nicht zusammenfassen.** Jeder Baustein bekommt **3-5 Fragen** zugeordnet, sodass insgesamt 15-25 Fragen rauskommen. Verteilung ungefaehr gleichmaessig (jeder Baustein ist gleich wichtig).

### Baustein 1 — Strukturelle KI-Reife

**Kernfrage:** Wie gut ist die Firma strukturell aufgestellt, damit KI ueberhaupt sinnvoll andocken kann? (Datenqualitaet, Prozess-Klarheit, Systemlandschaft, Verantwortlichkeiten)

**Beispiel-Themen fuer Fragen:** Wie viele zentrale Datenquellen gibt es? Sind Prozesse digital oder zettel-/excel-basiert? Gibt es eine Person, die die Systemlandschaft ueberblickt? Sind Stammdaten konsistent?

### Baustein 2 — Entscheidungs-Qualitaet

**Kernfrage:** Wie konsistent und nachvollziehbar sind Entscheidungsprozesse im Unternehmen? (Wer entscheidet was, auf welcher Basis, wie wird kommuniziert)

**Beispiel-Themen fuer Fragen:** Werden Entscheidungen dokumentiert oder muendlich gefaellt? Wer entscheidet bei Abwesenheit des GF? Werden Entscheidungen rueckblickend ueberprueft? Gibt es regelmaessige Strategie-Termine?

### Baustein 3 — Schriftlich festgehaltene Entscheidungen

**Kernfrage:** Wie viel Wissen ist dokumentiert vs. Kopf-Wissen des Gruenders/GF? (Bus-Faktor, Nachfolge-Faehigkeit, Skalierungs-Faehigkeit)

**Beispiel-Themen fuer Fragen:** Was passiert, wenn der GF 4 Wochen im Krankenhaus liegt? Gibt es ein zentrales Dokumenten-Ablage-System? Sind Vertraege, Konditionen, Kunden-Sonderregeln zentral auffindbar? Wer kann was rekonstruieren?

### Baustein 4 — SOPs (Standard Operating Procedures)

**Kernfrage:** Gibt es dokumentierte Standard-Ablaeufe fuer wiederkehrende Aufgaben, und sind die aktuell?

**Beispiel-Themen fuer Fragen:** Hat ein Neuer Mitarbeiter eine schriftliche Einarbeitung? Sind Standardprozesse (Angebotserstellung, Auftragsabwicklung, Reklamation) dokumentiert? Werden SOPs aktualisiert, wenn sich Ablaeufe aendern? Gibt es Trainings auf Basis der SOPs?

### Baustein 5 — Unternehmerhandbuch

**Kernfrage:** Gibt es ein zentrales, lebendes Wissens-Dokument, das die Firma als Ganzes beschreibt? (Vision, Strategie, Werte, Strukturen, Schluesselprozesse)

**Beispiel-Themen fuer Fragen:** Koennte ein neuer Geschaeftsfuehrer in 4 Wochen die Firma uebernehmen? Gibt es ein Dokument, das die Firma fuer einen Kaeufer beschreiben wuerde? Werden strategische Entscheidungen schriftlich begruendet? Wird das Handbuch genutzt oder liegt es nur rum?

### Baustein 6 — Workaround-Dunkelziffer

**Kernfrage:** Wie viele undokumentierte Workarounds nutzen Mitarbeiter taeglich, um Systemluecken zu kompensieren? (Schatten-Excel-Listen, manuelle Umgehungen, Tools an der IT vorbei)

**Beispiel-Themen fuer Fragen:** Gibt es Excel-Listen, die niemand offiziell kennt aber alle nutzen? Werden Daten aus dem ERP exportiert und woanders weiterverarbeitet? Nutzen Mitarbeiter private Tools (WhatsApp-Gruppen, Google-Sheets) fuer geschaeftliche Ablaeufe? Wer wuerde wissen, wie viele solche Workarounds existieren?

---

## TEIL 3 — SCORE-LOGIK-PRINZIPIEN (Pflicht)

Pro Frage muss eine **deterministische Mapping-Regel** geliefert werden, die jede moegliche Antwort auf einen Score 0-100 mappt. Kein LLM wertet die Antwort aus — das passiert per fester Logik.

### Drei zulaessige Antwort-Typen

1. **Skalen-Frage (Likert 5-Punkt)** — "Trifft gar nicht zu / Trifft eher nicht zu / Teils-teils / Trifft eher zu / Trifft voll zu"
   - Mapping: 0 / 25 / 50 / 75 / 100 (oder umgekehrt bei negativen Fragen)

2. **Multiple-Choice (3-5 Optionen)** — z.B. "Wer entscheidet bei Abwesenheit des GF? — Niemand / Ein Stellvertreter ohne klare Befugnis / Klar definierte Vertretungsregelung mit dokumentierten Befugnissen"
   - Mapping: jede Option bekommt fixen Score (z.B. 0 / 40 / 90)

3. **Numerische Frage mit Bucket-Mapping** — z.B. "Wie viele Excel-Listen ausserhalb des ERP nutzen Sie ungefaehr?"
   - Mapping: 0 = 100 Punkte, 1-3 = 70, 4-10 = 40, 11+ = 10

### Score pro Baustein

Score pro Baustein = arithmetisches Mittel aller Fragen-Scores in diesem Baustein, gerundet auf ganze Zahl 0-100.

### Score-Interpretation (fuer den Bericht)

- **0-30:** Strukturell nicht KI-tauglich — KI wuerde Schaden anrichten
- **31-55:** Erste Strukturen vorhanden — KI nur in eng begrenzten Pilotbereichen sinnvoll
- **56-75:** Solide Basis — KI kann gezielt in mehreren Bereichen Wirkung entfalten
- **76-100:** KI-bereit — strukturelle Voraussetzungen sind erfuellt, jetzt ist Werkzeug-Wahl die Frage

### Gewichtung zwischen Bausteinen

In V1: **alle 6 Bausteine gleich gewichtet** (Gesamt-Score = Mittel der 6 Baustein-Scores). Keine Sonder-Gewichtung — Einfachheit > Praezision in V1.

### Negative Fragen-Behandlung

Wenn eine Frage so formuliert ist, dass "hohe Antwort = schlecht" (z.B. "Wie viele Workarounds gibt es?"), muss das Mapping invertiert sein (viel = wenig Punkte). Pro Frage ist im Output explizit anzugeben, ob die Skala "positiv" oder "negativ" gerichtet ist.

---

## TEIL 4 — OUTPUT-FORMAT (Pflicht-Struktur fuer ChatGPT-Antwort)

Lieferung als **eine einzige Markdown-Datei** mit exakt folgender Struktur. **Keine Abweichung, keine Zusatz-Sektionen, keine Erklaerungen drumherum.** Genau dieses Format wird in der naechsten Session 1:1 in das Template-JSON-Schema der Onboarding-Plattform ueberfuehrt.

````markdown
# Diagnose-Werkzeug — Inhalts-Workshop-Output v1

## Pflicht-Output-Aussage (Schluss-Satz im Bericht)

> "[finaler Wortlaut, ein Satz oder maximal 3 Saetze, exakter Sprachgebrauch fuer den Bericht-Footer]"

## Baustein 1 — Strukturelle KI-Reife

**Baustein-Intro (1-2 Saetze, was misst dieser Baustein, fuer den Mandanten verstaendlich):**
[Text]

### Frage 1.1
**Frage-Text:** [exakter Wortlaut, wie der Mandant ihn liest]
**Antwort-Typ:** likert_5 | multiple_choice | numeric_bucket
**Skala-Richtung:** positive | negative
**Antwort-Optionen + Score-Mapping:**
- "[Option 1 Wortlaut]" → 0
- "[Option 2 Wortlaut]" → 25
- "[Option 3 Wortlaut]" → 50
- "[Option 4 Wortlaut]" → 75
- "[Option 5 Wortlaut]" → 100

### Frage 1.2
[gleiche Struktur]

### Frage 1.3
[gleiche Struktur]

[optional Frage 1.4 und 1.5 wenn sinnvoll, 3-5 Fragen pro Baustein]

## Baustein 2 — Entscheidungs-Qualitaet

[gleiche Struktur wie Baustein 1]

## Baustein 3 — Schriftlich festgehaltene Entscheidungen

[gleiche Struktur]

## Baustein 4 — SOPs

[gleiche Struktur]

## Baustein 5 — Unternehmerhandbuch

[gleiche Struktur]

## Baustein 6 — Workaround-Dunkelziffer

[gleiche Struktur]

## Bericht-Kommentar-Templates pro Baustein

Pro Baustein **drei Kommentar-Varianten**, abhaengig vom Baustein-Score-Bereich. Diese Templates werden vom LLM nicht ersetzt, sondern als Stil-Anker genutzt — der LLM-Output kommentiert die konkreten Antworten im Stil dieser Vorlagen.

### Baustein 1 — Strukturelle KI-Reife

- **Score 0-30:** "[1-2 Saetze typischer Kommentar bei schwachem Score — direkt, ehrlich, ohne Schmeichelei]"
- **Score 31-55:** "[1-2 Saetze typischer Kommentar bei mittlerem Score]"
- **Score 56-100:** "[1-2 Saetze typischer Kommentar bei gutem Score]"

### Baustein 2 — Entscheidungs-Qualitaet

[gleiche 3 Score-Bereiche]

### Baustein 3 — Schriftlich festgehaltene Entscheidungen

[gleiche 3 Score-Bereiche]

### Baustein 4 — SOPs

[gleiche 3 Score-Bereiche]

### Baustein 5 — Unternehmerhandbuch

[gleiche 3 Score-Bereiche]

### Baustein 6 — Workaround-Dunkelziffer

[gleiche 3 Score-Bereiche]

## Editorische Hinweise (optional, wenn relevant)

- [Falls Antwort-Optionen bewusst ungewoehnlich formuliert sind: kurze Begruendung]
- [Falls eine Frage absichtlich provokant ist: kurze Begruendung]
- [Sonstige Kuratoren-Notizen, die der Implementierung helfen]
````

### Beispiel einer ausformulierten Frage (zur Orientierung)

````markdown
### Frage 3.1
**Frage-Text:** Stellen Sie sich vor, Ihr Geschaeftsfuehrer faellt fuer vier Wochen vollstaendig aus (Krankenhaus, keine Erreichbarkeit). Wie viel Prozent der laufenden Entscheidungen koennen ohne ihn getroffen werden, weil die Grundlagen schriftlich dokumentiert sind?
**Antwort-Typ:** likert_5
**Skala-Richtung:** positive
**Antwort-Optionen + Score-Mapping:**
- "Unter 20% — nichts laeuft ohne ihn" → 0
- "20-40% — Stellvertreter fragt staendig nach" → 25
- "40-60% — laeuft halbwegs, aber holprig" → 50
- "60-80% — die meisten Sachen sind sauber dokumentiert" → 75
- "Ueber 80% — der Laden laeuft, er wird nur vermisst" → 100
````

---

## TEIL 5 — WAS NICHT ZU TUN IST

- **Keine Beratungs-Empfehlungen im Bericht-Text** (das ist nicht der Job des Werkzeugs — der Mandant zieht selbst die Schluesse).
- **Keine konkreten Tool-Empfehlungen** ("nutzen Sie HubSpot", "kaufen Sie Microsoft Copilot"). Strategaize ist tool-agnostisch.
- **Keine Soft-Selling-Klauseln** ("Strategaize hilft Ihnen dabei ..."). Das gehoert in den Sub-Karten-Bereich "Ich will mehr von Strategaize", nicht in den Bericht.
- **Keine Floskeln** wie "In der heutigen schnelllebigen Welt ...", "Digitalisierung ist wichtiger denn je ..." — der Mandant ueberblaettert das.
- **Keine Fragen, die Insider-Wissen voraussetzen** ("Welche LLM-Architektur nutzen Sie?"). Die Zielgruppe ist Mittelstands-GF, kein CTO.
- **Keine Fragen, die nur mit "Ja/Nein" beantwortbar sind** ohne Score-Differenzierung — entweder Likert-5 oder Multiple-Choice mit 3+ Optionen.

---

## TEIL 6 — WORKFLOW

1. **Du:** Diese Datei oeffnen, **Teil 1 bis Teil 5 als ein Block in ChatGPT pasten**.
2. **ChatGPT:** Liefert das Markdown-Dokument im Output-Format aus Teil 4.
3. **Du:** Output sichten, ggf. ein, zwei Iterationen ("Frage 4.2 ist zu lang", "Workaround-Frage 6.1 trifft den Punkt nicht").
4. **Du:** Finalen Markdown als `docs/DIAGNOSE_WERKZEUG_INHALT.md` in dieses Repo legen (gleicher Ordner wie dieses Briefing) und mir in der naechsten Session sagen "DIAGNOSE_WERKZEUG_INHALT.md liegt drin, mach SLC-105."
5. **Ich (Claude in der naechsten Session):** Lese die Datei, ueberfuehre sie in die `template`-Tabelle als `partner_diagnostic_v1` (FEAT-045, SLC-105), baue Light-Condensation-Pipeline + Bericht-Renderer drumherum.

---

## TEIL 7 — REFERENZEN (fuer dich, nicht fuer ChatGPT)

- Multiplikator-Konzept: `c:/strategaize/strategaize-dev-system/docs/MULTIPLIER_MODEL.md` (insbesondere Achse 4 + Inhaltliche Skizze + Achse 8 Diagnose-Werkzeug-Quality-Risk)
- Feature-Spec: `features/FEAT-045-diagnose-werkzeug-template-pipeline-renderer.md`
- V6-Discovery: `reports/RPT-208.md` (Sektion 4.4 Auto-Finalize-Optionen)
- Backlog-Item: `BL-095` in `planning/backlog.json`
