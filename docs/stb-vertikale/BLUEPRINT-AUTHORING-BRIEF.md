# StB-Kanzlei-Blueprint — Autoring-Anweisung für eine eigene Session

> **Zweck dieses Dokuments:** Du (Founder) erstellst in einer separaten Session (ChatGPT oder
> frische Claude-Session) die **Inhalte des Kanzlei-Blueprints**. Dieses Dokument ist die
> komplette, eigenständige Anweisung dafür. Kopiere den ganzen Text in die neue Session und
> arbeite ihn Baustein für Baustein ab. Das Ergebnis ist **ein strukturiertes Dokument**, das
> der Build-Session übergeben wird — daraus wird die Seed-Migration gebaut (so wie aus dem
> `M-04`-Dokument der M-04-Seed entstand). **Du lieferst Inhalt, die Technik macht die andere Session.**
>
> Stand: 2026-06-22 · Kontext: OP V10 StB-Vertikale · Slice SLC-170b (Blueprint-Welle) · DEC-234 / DEC-242 / DEC-244

---

## 0. So benutzt du diese Anweisung

1. Öffne eine **neue, leere Session** (ChatGPT oder Claude — egal).
2. **Kopiere dieses ganze Dokument** in die erste Nachricht.
3. Schreib darunter einen Satz wie: *„Lass uns mit Baustein 1 (Themenbaum) beginnen. Führe mich Schritt für Schritt durch, stell mir die Fragen, die du von mir brauchst, und schlag jeweils etwas vor — die inhaltliche Entscheidung treffe ich."*
4. Arbeitet die vier Bausteine der Reihe nach durch. Am Ende lässt du dir **das vollständige Liefer-Dokument** ausgeben (Format siehe Abschnitt 6) und gibst es mir.

Du musst **nichts Technisches** schreiben — kein JSON, kein SQL. Du lieferst die fachlichen Inhalte in Tabellen-/Textform. Den Rest mache ich.

---

## 1. Kontext — worum es geht und warum

**Das Produkt:** Eine Plattform, die für eine Steuerkanzlei pro Themen-**Modul** eine „operative Wirk-Schicht" erzeugt: aus den Antworten des Inhabers werden je relevantem Thema **Entscheidung / Standard / Implementierungsschritt** abgeleitet, plus **KI-Hebel** (mit Reifegrad). Ein Modul (M-04 Finanzsteuerung) ist bereits voll ausgearbeitet und dient als Tiefen-Referenz.

**Der Blueprint (M-BP)** ist der **Einstieg** in dieses System. Er ist **kein** Fachmodul, sondern eine **Diagnostik über die ganze Kanzlei** mit zwei Aufgaben:

1. **Standortbestimmung:** Wo steht die Kanzlei insgesamt? — Ampel (rot/gelb/grün) + Reifegrad + Empfehlung je Themenbereich.
2. **Routing:** Welche Diagnose-Ergebnisse schicken den Berater in welches **Vertiefungsmodul** (z. B. schwache Finanztransparenz → Modul M-04, Liquiditätsthema → M-06, Nachfolge → M-35).

Der Blueprint bedient **zwei Eingänge** in die Kanzlei:
- **Eingang A — Nachfolge / Übergabefähigkeit** (Inhaberabhängigkeit, Verträge, Loslassen).
- **Eingang B — KI-/Zukunfts-Readiness** (Systemlandschaft, Prozesse, Wissen).

**Warum zuerst der Blueprint:** Er ist der Einstieg und definiert das Routing in alle anderen Module. Technisch entsperrt er den nächsten Bau-Schritt (die Diagnose-Funktion).

### Zwei verbindliche Leitplanken (wichtig!)

- **Neuer StB-Inhalt — NICHT das alte „Exit-Readiness"-Material wiederverwenden.** Es gibt im System bereits einen Exit-Readiness-Blueprint (Mechanik gut, Inhalt anders). Der StB-Blueprint übernimmt nur die **Mechanik/Struktur**, der **Inhalt ist neu** und auf die Steuerkanzlei zugeschnitten. (DEC-234)
- **DATEV-Abgrenzung:** Der Blueprint ist die **operative Wirk-Schicht** der Kanzlei — **kein** „Kanzlei-Organisationshandbuch" im DATEV-Sinn. Das soll auch in der Sprache durchscheinen.

---

## 2. Was am Ende herauskommen muss — die vier Bausteine

Diese vier Dinge brauche ich von dir. Jeder Baustein unten erklärt: **was es ist**, **wie es M-04 gelöst hat** (als Tiefen-Maßstab) und **wo es technisch landet** (damit du die richtige Struktur lieferst).

---

### BAUSTEIN 1 — Diagnose-Themenbaum (die Landkarte)

**Was:** Die Bereiche, über die der Blueprint urteilt, in zwei Ebenen.
- **5–7 Diagnose-Blöcke** (große Bereiche der Kanzlei).
- Je Block **2–6 Unterthemen** (das, was konkret bewertet wird).

**Orientierung an den Kanzlei-Dimensionen** (sie entsprechen den späteren Vertiefungsmodulen — siehe Baustein 4): Führung & Struktur · Finanzen & Controlling · Vertrieb & Marketing · HR & Personal · Nachfolge & Recht · IT, Daten & Tools · Wissensmanagement · Unternehmer-Rolle.

**Wie M-04 es machte (Maßstab):** M-04 hatte ein 7-Bereiche-Themenmodell mit Unterpunkten. Für den Blueprint geht es **breiter, aber flacher** — ein Überblick über die ganze Kanzlei, nicht die Tiefe eines Einzelmoduls.

**Wohin es technisch geht:** in ein „Block → Unterthemen"-Modell. Jeder Block bekommt einen Schlüssel (z. B. `A`, `B`, … oder thematisch), jedes Unterthema einen sprechenden Schlüssel (`a1_fuehrungsstruktur`) + einen Namen. **Struktur-Beispiel** (NUR Form, NICHT Inhalt — der Inhalt ist neu!):

```
Block A — Führung & Struktur
   a1_fuehrungsstruktur     "Führungsstruktur"
   a2_rollen                "Rollen & Verantwortung"
   a3_entscheidungswege     "Entscheidungswege"
   a4_stellvertretung       "Stellvertretung & Ausfall"
Block B — Finanzen & Steuerung
   b1_finanztransparenz     "Finanztransparenz der eigenen Kanzlei"
   ...
```

**Dein Output für Baustein 1:** eine Tabelle mit Spalten: `Block-Schlüssel | Block-Name | Unterthema-Schlüssel | Unterthema-Name`.

---

### BAUSTEIN 2 — Diagnose-Fragen je Unterthema

**Was:** Pro Unterthema **1–5 Fragen**, die der Kanzlei-Inhaber beantwortet. Ihre Antworten sind die Grundlage der Diagnose.

**Pro Frage brauchst du:**
- **Frage-ID** — fortlaufend im Schema `F-BP-001`, `F-BP-002`, … (BP = Blueprint).
- **Fragetext** — offen formuliert (keine Multiple-Choice; offene Fragen, die zum Erzählen einladen).
- **Ebene** — `Stufe-1-Kern` (Pflicht, der schnelle Durchlauf) **oder** `Stufe-2-Vertiefung` (optional, geht tiefer).
- **Unterthema** — auf welches Unterthema aus Baustein 1 die Frage zahlt.

**Wie M-04 es machte (Maßstab):** 26 Fragen, davon 10 Kern (Pflicht) + 16 Vertiefung, alle offen, jede einem Unterbereich zugeordnet. Für den Blueprint reichen **deutlich weniger Fragen pro Unterthema** — er ist ein Breiten-Scan, die Tiefe holen die Module.

**Wohin es technisch geht:** die Fragen werden zum Fragebogen (zwei Blocks: Kern = Pflicht, Vertiefung = optional), jede Frage mit ihrer `frage_id`. Die `question_keys` verbinden Fragen mit Unterthemen (siehe Baustein 3).

**Dein Output für Baustein 2:** eine Tabelle mit Spalten: `Frage-ID | Unterthema-Schlüssel | Ebene (Kern/Vertiefung) | Fragetext`.

---

### BAUSTEIN 3 — Bewertungs-Logik je Unterthema (Ampel / Reifegrad / Empfehlung)

**Was:** Die KI erzeugt aus den Antworten **pro Unterthema** eine Bewertung. Du legst fest, **was die Bewertung in StB-Begriffen bedeutet** — also was „rot/gelb/grün" und die Reifegrad-Stufen für eine Kanzlei heißen, und worauf die KI achten soll. (Du füllst die Bewertungen **nicht** selbst aus — das macht später die KI pro Mandanten-Kanzlei. Du definierst die **Maßstäbe**.)

**Die Bewertungs-Felder, die das System je Unterthema erzeugt** (so sieht die Mechanik aus — orientiere deine Maßstäbe daran):

| Feld | Bedeutung | Werte |
|---|---|---|
| `ist_situation` | Beschreibung des Ist-Zustands | Text |
| `ampel` | Gesamteinschätzung | grün / gelb / rot |
| `reifegrad` | Reifegrad des Bereichs | Stufe (siehe unten) |
| `risiko` | Risiko bei Übergabe / im Betrieb | Skala |
| `hebel` | Wirkung einer Verbesserung | Skala |
| `relevanz_90d` | Dringlichkeit | hoch / mittel / niedrig |
| `empfehlung` | konkrete Maßnahme | Text |
| `naechster_schritt` | der allererste Schritt | Text |
| `zielbild` | Soll-Zustand (Definition of Done) | Text |

**Was DU dafür lieferst:**
1. **Ampel-Definition (StB-spezifisch):** Was bedeutet **grün / gelb / rot** für eine Steuerkanzlei? (z. B. rot = „blockiert Übergabefähigkeit oder existenzielles Risiko"; gelb = „funktioniert, aber Handlungsbedarf"; grün = „solide"). Gerne global einmal + bei einzelnen Unterthemen, wo es abweicht.
2. **Reifegrad-Stufen:** Was bedeuten die Stufen? **Wir nutzen Reifegrad 1–4** (konsistent zu den Modulen): grob 1 = nicht vorhanden/chaotisch, 2 = rudimentär, 3 = funktioniert aber fragil, 4 = professionell/übergabefähig. Schärfe das in deinen Worten.
3. **Diagnose-Haltung / Prompt-Inhalt:** In welcher Rolle und mit welchem Ton soll die KI diagnostizieren (z. B. „erfahrener Kanzlei-/Nachfolge-Berater, ehrlich, evidenzbasiert, handlungsorientiert, priorisierend nach Übergabefähigkeit + KI-Readiness")? Worauf soll sie besonders achten (Inhaberabhängigkeit, Personalengpass „83 %-Problem", DATEV-/Systemverzahnung …)?

**Wie M-04 es machte (Maßstab):** M-04 hatte keine eigene Diagnose-Logik (es ist ein Fachmodul). Der Blueprint ist hier der **anspruchsvollere** Teil — vergleichbar mit der Diagnose-Mechanik des bestehenden Exit-Readiness-Blueprints, aber inhaltlich für die Kanzlei neu.

**Wohin es technisch geht:** in `diagnosis_schema` (die Felder oben) + `diagnosis_prompt` (Rolle, Ton, Feld-Anweisungen). **Hinweis fürs Bau-Team:** die genaue Zahlen-Skala (Reifegrad 1–4 vs. 0–10) wird beim Seed gemappt — du lieferst die **Bedeutung**, nicht die Zahlen.

**Dein Output für Baustein 3:** (a) Ampel-Definition, (b) Reifegrad-Stufen 1–4 in Kanzlei-Worten, (c) Diagnose-Haltung/Prompt-Text. Wenn einzelne Unterthemen eine eigene Ampel-/Reifegrad-Definition brauchen: dazuschreiben, sonst gilt die globale.

---

### BAUSTEIN 4 — Routing-Map (Diagnose-Ergebnis → Vertiefungsmodul)

**Was:** Die **deterministische** Tabelle, die festlegt: **welcher Diagnose-Bereich → welches Modul.** Wenn der Blueprint in einem Bereich Handlungsbedarf zeigt (z. B. gelb/rot), wird der Berater in das passende Vertiefungsmodul geschickt.

**Die verfügbaren Ziel-Module (der StB-Kern-Cut, 17 Fachmodule):**

| modul_key | Modul | Dimension |
|---|---|---|
| `m01` | Geschäftsmodell & Werttreiber | Führung & Struktur |
| `m02` | Organisationsstruktur & Rollen | Führung & Struktur |
| `m03` | Entscheidungsprozesse & Governance | Führung & Struktur |
| `m04` | Grundlegende Finanzsteuerung (GuV/Bilanz/Cash) | Finanzen & Controlling |
| `m06` | Liquiditätsplanung & Zahlungsströme | Finanzen & Controlling |
| `m07` | KPI-Set & Reporting-Struktur | Finanzen & Controlling |
| `m08` | Vertriebsstrategie & Zielkunden | Vertrieb |
| `m15` | Positionierung & Kernbotschaften | Marketing |
| `m16` | Leadgenerierung & Kanäle | Marketing |
| `m26` | Personalstruktur & strateg. Personalbedarf | HR & Personal |
| `m27` | Rekrutierung & Employer Branding | HR & Personal |
| `m28` | Onboarding & Einarbeitung | HR & Personal |
| `m35` | Gesellschafts-, Nachfolge- & Gesellschafterverträge | Recht & Verträge (Nachfolge-Eingang A) |
| `m36` | Systemlandschaft & Integrationen | IT, Daten & Tools (KI-Readiness B) |
| `m38` | IT-Sicherheit, Backups & Ausfallrisiken | IT, Daten & Tools |
| `m39` | Zentrale Wissensplattform & Dokumenttypen | Wissensmanagement |
| `m42` | Unternehmer-Rolle & Entscheidungsklarheit | Persönlich (Loslassen) |

> (M-05 ist bewusst **nicht** im Cut. Nur diese 17 Module sind gültige Routing-Ziele in Phase 1.)

**Was DU lieferst:** je **Block bzw. Unterthema** aus Baustein 1 das **primäre Zielmodul** (+ optional ein sekundäres). Idealerweise verknüpfst du das mit einer Bedingung („wenn Ampel gelb/rot → Modul X"). Es ist völlig ok, wenn ein Bereich auf mehrere Module zeigt — gib dann eine Reihenfolge an.

**Wohin es technisch geht:** in eine Block/Unterthema → `modul_key`-Routing-Map, die die Diagnose-Funktion liest, um die nächsten Module vorzuschlagen.

**Dein Output für Baustein 4:** eine Tabelle mit Spalten: `Block/Unterthema-Schlüssel | Bedingung (z.B. Ampel gelb/rot) | primäres modul_key | sekundäres modul_key (optional)`.

---

## 3. Verbindliche Regeln für die Autoring-Session

- **Du entscheidest den Inhalt, die KI assistiert.** Die KI darf vorschlagen, strukturieren, umformulieren und dir Lücken aufzeigen — aber **keine Kanzlei-Fakten erfinden und als Wahrheit verkaufen**. Bei Unsicherheit fragt sie dich. (immoscheckheft-/„nicht raten"-Disziplin.)
- **Neuer StB-Inhalt**, kein recyceltes Exit-Readiness (DEC-234).
- **DATEV-Abgrenzung** in der Sprache: operative Wirk-Schicht, kein Organisationshandbuch.
- **IDs konsistent:** Fragen `F-BP-001` aufwärts; Block-Schlüssel kurz (`A`,`B`,… oder thematisch); Unterthema-Schlüssel klein-mit-unterstrich (`a1_xyz`).
- **Reifegrad 1–4** (konsistent zu den Modulen).
- **Routing nur auf die 17 erlaubten `modul_key`s** aus Baustein 4.

---

## 4. Der Tiefen-Maßstab „M-04" (zur Orientierung)

Damit du ein Gefühl für die erwartete Sorgfalt hast — so sieht das fertige M-04 aus:
- **Themenmodell:** 7 Bereiche mit Unterpunkten.
- **Fragebogen:** 26 offene Fragen (10 Kern Pflicht + 16 Vertiefung optional), jede einem Unterbereich zugeordnet.
- **KI-Hebel:** 13 Stück mit Reifegrad 1–4.

**Aber Achtung — der Blueprint ist anders gelagert:** Ein Fachmodul (wie M-04) liefert am Ende das Triple (Entscheidung/Standard/Implementierungsschritt) + KI-Hebel. Der **Blueprint** liefert stattdessen **Diagnose (Ampel/Reifegrad/Empfehlung) + Routing**. Deshalb braucht der Blueprint **keinen** eigenen KI-Hebel-Katalog und **kein** Triple — sondern die vier Bausteine oben. Er darf pro Bereich **schlanker** sein als ein Fachmodul (Breite vor Tiefe).

---

## 5. Reihenfolge in der Session (Empfehlung)

1. **Baustein 1** (Themenbaum) — erst die Landkarte. Hier die meiste Denkarbeit.
2. **Baustein 4** (Routing) gleich anschließen, solange die Bereiche frisch sind — pro Bereich das Zielmodul festlegen.
3. **Baustein 2** (Fragen) je Unterthema.
4. **Baustein 3** (Bewertungs-Logik) zum Schluss — Ampel-/Reifegrad-Bedeutung + Diagnose-Haltung.

Mach gern **Pausen pro Baustein** und lass dir Zwischenstände zusammenfassen.

---

## 6. Liefer-Format (das gibst du mir zurück)

Am Ende der Session lass dir **ein** zusammenhängendes Dokument ausgeben mit genau diesen Abschnitten:

1. **Themenbaum** — Tabelle: Block-Schlüssel · Block-Name · Unterthema-Schlüssel · Unterthema-Name.
2. **Fragen** — Tabelle: Frage-ID · Unterthema-Schlüssel · Ebene · Fragetext.
3. **Bewertungs-Logik** — (a) Ampel-Definition, (b) Reifegrad 1–4 in Kanzlei-Worten, (c) Diagnose-Haltung/Prompt-Text, (d) ggf. Unterthema-spezifische Abweichungen.
4. **Routing-Map** — Tabelle: Block/Unterthema-Schlüssel · Bedingung · primäres modul_key · sekundäres modul_key.

Tabellen-Form (oder klar strukturierter Text). **Kein JSON/SQL nötig.** Schick mir dieses Dokument — ich baue daraus die Seed-Migration (`stb_blueprint_kanzlei`) plus ein `Blueprint-seed-source.md` (Provenienz-Mapping), genau wie bei M-04.

---

## 7. Kickoff — was du in die neue Session schreibst

> Kopiere dieses **gesamte Dokument** in die neue Session und schreib darunter:
>
> *„Das ist die Anweisung. Wir erstellen jetzt gemeinsam die Inhalte des StB-Kanzlei-Blueprints. Führe mich Baustein für Baustein durch (Reihenfolge wie in Abschnitt 5), stell mir pro Schritt die Fragen, die du von mir brauchst, und mach mir konkrete Vorschläge — die fachliche Entscheidung treffe ich. Erfinde keine Kanzlei-Fakten; bei Unsicherheit frag mich. Am Ende gibst du mir das vollständige Liefer-Dokument nach Abschnitt 6. Lass uns mit Baustein 1 (Themenbaum) starten."*
