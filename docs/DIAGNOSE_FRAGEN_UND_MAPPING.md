# Diagnose-Werkzeug — Fragen und Score-Mapping (Pruef-Uebersicht)

**Template-Slug:** `partner_diagnostic`
**Version:** `v1`
**Live-DB-Stand:** Hetzner 159.69.207.29, `template`-Tabelle, verifiziert 2026-05-17
**Quelle:** Inhalts-Workshop-Output 2026-05-16 ([docs/DIAGNOSE_WERKZEUG_INHALT.md](DIAGNOSE_WERKZEUG_INHALT.md))
**Seed-Migration:** [sql/migrations/093_v63_partner_diagnostic_seed.sql](../sql/migrations/093_v63_partner_diagnostic_seed.sql)

Diese Datei ist eine kompakte Pruef-Uebersicht zum Gegenchecken-lassen (Steuerberater, Anwalt, Fach-Reviewer). Sie enthaelt:
- Alle 24 Fragen entlang 6 Bausteinen
- Score-Mapping pro Antwort-Option (deterministisch 0-100)
- Stil-Anker fuer die KI-Kommentar-Erzeugung pro Score-Bereich
- Pflicht-Output-Aussage (Bericht-Schluss-Satz, score-unabhaengig)

**Wichtig fuers Verstaendnis:**
- Die Zahl rechts ist der Punktwert, der bei Wahl der Antwort eingerechnet wird.
- Block-Score = Mittelwert der 4 Fragen-Scores (gerundet).
- Skala-Richtung `negative` heisst: hoher Score = beste Antwort, der Wert wird **nicht** invertiert — die Score-Werte in der Tabelle sind schon final (siehe z.B. Frage 1.1 + 1.4).
- KI ersetzt die Stil-Anker nicht, sondern kommentiert die konkreten Antworten **im Stil dieser Vorlagen**.

---

## Pflicht-Output-Aussage (Bericht-Schluss-Satz, immer gleich)

> "Wir sind noch nicht bereit, KI strukturiert einzusetzen. Wir haben offene Flanken, wir muessen Hausaufgaben machen. Aber wenn wir die Zeit dafuer nehmen, wird KI ein echter Faktor in unserem Unternehmen sein."

(206 Zeichen. Score-unabhaengig. Steht als Markdown-Footer am Ende jedes Berichts.)

---

## Baustein 1 — Strukturelle KI-Reife

**Intro:** Dieser Baustein misst, ob Ihre Firma ueberhaupt sauber genug organisiert ist, damit KI sinnvoll helfen kann. Wenn Daten, Prozesse und Verantwortlichkeiten unklar sind, automatisiert KI nicht die Loesung, sondern verstaerkt das Durcheinander.

### Frage 1.1
**Wie viele zentrale Systeme oder Datenquellen nutzen Sie heute fuer Kunden, Auftraege, Angebote, Rechnungen und interne Abstimmungen?**

| Antwort-Option | Score |
|---|---:|
| Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollstaendigen Ueberblick | 0 |
| 6-10 Systeme oder Listen — es funktioniert, aber vieles ist verstreut | 25 |
| 4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden | 50 |
| 2-3 zentrale Systeme — die Firma ist weitgehend strukturiert | 75 |
| 1 klares Hauptsystem mit sauberer Ergaenzung — die Datenlage ist uebersichtlich | 100 |

### Frage 1.2
**Wie verlaesslich sind Ihre Stammdaten, zum Beispiel Kundeninformationen, Ansprechpartner, Konditionen, Artikel, Leistungen oder Projektstaende?**

| Antwort-Option | Score |
|---|---:|
| Sehr unzuverlaessig — wir muessen oft nachfragen oder suchen | 0 |
| Eher unzuverlaessig — es gibt regelmaessig Dubletten, alte Daten oder Luecken | 25 |
| Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend | 50 |
| Eher zuverlaessig — Fehler kommen vor, sind aber nicht die Regel | 75 |
| Sehr zuverlaessig — wir koennen uns im Tagesgeschaeft darauf verlassen | 100 |

### Frage 1.3
**Wie klar ist in Ihrer Firma festgelegt, wer fuer Systeme, Datenqualitaet und Prozesspflege verantwortlich ist?**

| Antwort-Option | Score |
|---|---:|
| Niemand — es kuemmert sich, wer gerade Zeit hat | 0 |
| Der Geschaeftsfuehrer — aber eher nebenbei und ohne feste Struktur | 25 |
| Einzelne Mitarbeiter kuemmern sich darum, aber ohne klare Gesamtverantwortung | 50 |
| Es gibt klare Zustaendigkeiten fuer einzelne Bereiche | 75 |
| Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse | 100 |

### Frage 1.4
**Wie stark laufen Ihre wichtigsten Prozesse heute noch ueber Papier, E-Mail, Zuruf oder einzelne Excel-Dateien?**

| Antwort-Option | Score |
|---|---:|
| Sehr stark — ohne Papier, E-Mail und Excel wuerde vieles stehen bleiben | 0 |
| Stark — die offiziellen Systeme decken viele Ablaeufe nicht sauber ab | 25 |
| Gemischt — wichtige Teile sind digital, aber viele Uebergaben sind manuell | 50 |
| Eher gering — die meisten Prozesse laufen in geregelten Systemen | 75 |
| Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestuetzt | 100 |

### Stil-Anker Baustein 1

- **Score 0-30:** "Ihre strukturelle Basis ist aktuell nicht KI-tauglich. Wenn KI auf verstreute Daten, unklare Systeme und unsaubere Zustaendigkeiten trifft, entstehen mehr Fehler als Entlastung."
- **Score 31-55:** "Es gibt erste Strukturen, aber noch keinen belastbaren Unterbau fuer breiteren KI-Einsatz. Einzelne Pilotbereiche sind denkbar, aber nur dort, wo Daten und Prozesse wirklich sauber genug sind."
- **Score 56-100:** "Die Firma hat eine brauchbare strukturelle Grundlage fuer KI. Der naechste Engpass liegt weniger in der Technik, sondern darin, die passenden Anwendungsfaelle sauber auszuwaehlen und kontrolliert umzusetzen."

---

## Baustein 2 — Entscheidungs-Qualitaet

**Intro:** Dieser Baustein misst, wie sauber Entscheidungen in Ihrer Firma entstehen, kommuniziert und nachgehalten werden. KI kann nur dann sinnvoll unterstuetzen, wenn klar ist, wer entscheidet, auf welcher Grundlage entschieden wird und was danach passiert.

### Frage 2.1
**Wie werden wichtige Entscheidungen in Ihrem Unternehmen normalerweise festgehalten?**

| Antwort-Option | Score |
|---|---:|
| Gar nicht — Entscheidungen werden muendlich getroffen und bleiben im Kopf | 0 |
| Teilweise in E-Mails oder Chats — spaeter schwer auffindbar | 25 |
| In einzelnen Protokollen oder Dateien — aber nicht einheitlich | 50 |
| In einer festen Ablage oder einem festen Format — meistens nachvollziehbar | 75 |
| Systematisch mit Entscheidung, Begruendung, Verantwortlichem und naechstem Schritt | 100 |

### Frage 2.2
**Was passiert, wenn der Geschaeftsfuehrer oder die wichtigste Fuehrungsperson zwei Wochen nicht erreichbar ist?**

| Antwort-Option | Score |
|---|---:|
| Viele Entscheidungen bleiben liegen | 0 |
| Mitarbeiter entscheiden aus dem Bauch heraus oder fragen informell herum | 25 |
| Ein Stellvertreter entscheidet einiges, aber ohne klare schriftliche Befugnisse | 50 |
| Es gibt klare Vertretungsregeln fuer die meisten operativen Entscheidungen | 75 |
| Es gibt dokumentierte Entscheidungsgrenzen, Vertretungen und Eskalationsregeln | 100 |

### Frage 2.3
**Wie haeufig pruefen Sie rueckblickend, ob groessere Entscheidungen die gewuenschte Wirkung hatten?**

| Antwort-Option | Score |
|---|---:|
| Nie — wenn entschieden ist, ist das Thema erledigt | 0 |
| Selten — nur wenn etwas sichtbar schieflaeuft | 25 |
| Gelegentlich — aber ohne festen Rhythmus | 50 |
| Regelmaessig bei wichtigen Themen | 75 |
| Systematisch mit Ergebnissen, Zahlen und klarer Lernschleife | 100 |

### Frage 2.4
**Auf welcher Grundlage werden operative und strategische Entscheidungen ueberwiegend getroffen?**

| Antwort-Option | Score |
|---|---:|
| Bauchgefuehl des Geschaeftsfuehrers | 0 |
| Erfahrung einzelner Schluesselpersonen | 25 |
| Mischung aus Erfahrung, Zahlen und Einzelinformationen | 50 |
| Ueberwiegend auf Basis von Zahlen, Berichten und klaren Kriterien | 75 |
| Auf Basis definierter Entscheidungslogik, belastbarer Daten und dokumentierter Annahmen | 100 |

### Stil-Anker Baustein 2

- **Score 0-30:** "Entscheidungen haengen noch zu stark an einzelnen Personen und muendlicher Abstimmung. KI kann in so einem Umfeld keine verlaessliche Unterstuetzung leisten, weil die Entscheidungslogik nicht stabil genug ist."
- **Score 31-55:** "Die Entscheidungsqualitaet ist teilweise vorhanden, aber noch nicht konsequent dokumentiert und ueberpruefbar. Fuer KI reicht das nur in eng begrenzten Bereichen mit klaren Regeln."
- **Score 56-100:** "Ihre Entscheidungsprozesse sind ueberwiegend nachvollziehbar. Das ist eine gute Voraussetzung, um KI nicht nur als Textwerkzeug, sondern als echte Unterstuetzung in Auswertung, Vorbereitung und Steuerung einzusetzen."

---

## Baustein 3 — Schriftlich festgehaltene Entscheidungen

**Intro:** Dieser Baustein misst, wie viel wichtiges Wissen schriftlich verfuegbar ist und wie viel nur in den Koepfen einzelner Personen steckt. Je mehr Kopf-Wissen ungesichert bleibt, desto schwerer werden Vertretung, Wachstum, Nachfolge und KI-Einsatz.

### Frage 3.1
**Stellen Sie sich vor, Ihr Geschaeftsfuehrer faellt fuer vier Wochen vollstaendig aus. Wie viel Prozent der laufenden Entscheidungen koennen ohne ihn getroffen werden, weil die Grundlagen schriftlich dokumentiert sind?**

| Antwort-Option | Score |
|---|---:|
| Unter 20% — ohne ihn bleibt vieles stehen | 0 |
| 20-40% — es laeuft nur mit vielen Rueckfragen und Improvisation | 25 |
| 40-60% — das Tagesgeschaeft laeuft halbwegs, aber holprig | 50 |
| 60-80% — die meisten Entscheidungen sind ausreichend vorbereitet | 75 |
| Ueber 80% — die Firma laeuft weiter, er wird nur vermisst | 100 |

### Frage 3.2
**Wo sind Sonderregeln zu Kunden, Preisen, Konditionen, Lieferzusagen oder internen Ausnahmen dokumentiert?**

| Antwort-Option | Score |
|---|---:|
| Nirgends — das wissen einzelne Personen | 0 |
| Verteilt in E-Mails, Chats oder persoenlichen Notizen | 25 |
| Teilweise in Kundenakten oder Projektunterlagen, aber nicht einheitlich | 50 |
| Meistens zentral auffindbar, aber nicht immer aktuell | 75 |
| Zentral, einheitlich und fuer berechtigte Personen nachvollziehbar | 100 |

### Frage 3.3
**Wie gut koennen neue Fuehrungskraefte oder Stellvertreter nachvollziehen, warum bestimmte Regeln, Preise, Ablaeufe oder Prioritaeten gelten?**

| Antwort-Option | Score |
|---|---:|
| Gar nicht — sie muessten die Historie muendlich erfragen | 0 |
| Eher schlecht — vieles erklaert sich nur durch alte Erfahrung | 25 |
| Teils-teils — manche Dinge sind dokumentiert, andere nicht | 50 |
| Eher gut — die meisten Grundlagen sind nachvollziehbar | 75 |
| Sehr gut — Entscheidungen und Hintergruende sind sauber dokumentiert | 100 |

### Frage 3.4
**Wie viele kritische Wissensbereiche gibt es in Ihrer Firma, die im Wesentlichen nur eine Person wirklich beherrscht?**

| Antwort-Option | Score |
|---|---:|
| 0 Bereiche | 100 |
| 1-2 Bereiche | 75 |
| 3-5 Bereiche | 50 |
| 6-10 Bereiche | 25 |
| Mehr als 10 Bereiche | 0 |

### Stil-Anker Baustein 3

- **Score 0-30:** "Zu viel wichtiges Wissen steckt noch in Koepfen einzelner Personen. Das macht Vertretung, Uebergabe und KI-Einsatz riskant, weil die Grundlagen nicht zuverlaessig abrufbar sind."
- **Score 31-55:** "Ein Teil des Wissens ist dokumentiert, aber noch nicht vollstaendig genug, um unabhaengig von Schluesselpersonen zu funktionieren. Genau hier liegt eine der wichtigsten Hausaufgaben vor ernsthaftem KI-Einsatz."
- **Score 56-100:** "Die Firma hat bereits eine solide schriftliche Wissensbasis. Dadurch kann KI spaeter deutlich besser unterstuetzen, weil sie auf dokumentierte Regeln, Entscheidungen und Zusammenhaenge zugreifen kann."

---

## Baustein 4 — SOPs

**Intro:** Dieser Baustein misst, ob wiederkehrende Aufgaben nach klaren Standards laufen oder jedes Mal neu erklaert werden muessen. Ohne belastbare Standardablaeufe kann KI kaum sinnvoll entlasten, weil nicht klar ist, welcher Ablauf ueberhaupt der richtige ist.

### Frage 4.1
**Wie gut sind Ihre wichtigsten Standardprozesse dokumentiert, zum Beispiel Angebotserstellung, Auftragsabwicklung, Reklamation, Rechnungsklaerung oder Einarbeitung?**

| Antwort-Option | Score |
|---|---:|
| Gar nicht — jeder macht es nach Erfahrung | 0 |
| Eher schlecht — es gibt einzelne Notizen, aber keine echte Prozessdokumentation | 25 |
| Teils-teils — einige Ablaeufe sind beschrieben, andere nicht | 50 |
| Eher gut — die meisten wichtigen Ablaeufe sind dokumentiert | 75 |
| Sehr gut — die zentralen Ablaeufe sind klar, aktuell und auffindbar dokumentiert | 100 |

### Frage 4.2
**Was bekommt ein neuer Mitarbeiter an die Hand, wenn er eine wiederkehrende Aufgabe uebernehmen soll?**

| Antwort-Option | Score |
|---|---:|
| Muendliche Erklaerung und dann ausprobieren | 0 |
| Erklaerung durch Kollegen plus alte Beispiele | 25 |
| Einzelne Checklisten oder Vorlagen, aber nicht vollstaendig | 50 |
| Eine dokumentierte Anleitung mit Beispielen fuer die meisten Aufgaben | 75 |
| Eine klare SOP mit Ziel, Ablauf, Verantwortlichkeiten, Ausnahmen und Qualitaetskriterien | 100 |

### Frage 4.3
**Wie oft werden dokumentierte Ablaeufe aktualisiert, wenn sich in der Praxis etwas aendert?**

| Antwort-Option | Score |
|---|---:|
| Nie — Dokumente veralten einfach | 0 |
| Selten — nur wenn jemand zufaellig daran denkt | 25 |
| Gelegentlich — aber ohne festen Verantwortlichen | 50 |
| Regelmaessig — Aenderungen werden meistens nachgezogen | 75 |
| Systematisch — Prozessaenderungen fuehren automatisch zur Aktualisierung der SOP | 100 |

### Frage 4.4
**Wie stark unterscheiden sich die Arbeitsweisen verschiedener Mitarbeiter bei derselben Standardaufgabe?**

| Antwort-Option | Score |
|---|---:|
| Sehr stark — jeder hat seine eigene Methode | 0 |
| Eher stark — Ergebnisse haengen deutlich von der Person ab | 25 |
| Mittel — es gibt grobe Gemeinsamkeiten, aber viele Varianten | 50 |
| Eher gering — die meisten arbeiten aehnlich | 75 |
| Sehr gering — Ablauf und Ergebnis sind weitgehend standardisiert | 100 |

### Stil-Anker Baustein 4

- **Score 0-30:** "Wiederkehrende Aufgaben laufen noch zu stark nach persoenlicher Erfahrung. KI wuerde hier keine Standards schaffen, sondern uneinheitliche Ablaeufe nur schneller reproduzieren."
- **Score 31-55:** "Es gibt erste Standards, aber sie sind noch nicht stabil genug fuer breitere Automatisierung. Fuer einzelne Ablaeufe kann KI helfen, wenn vorher klar festgelegt wird, wie der richtige Prozess aussieht."
- **Score 56-100:** "Ihre Standardprozesse sind in vielen Bereichen belastbar genug dokumentiert. Das eroeffnet realistische Moeglichkeiten, KI gezielt bei Vorbereitung, Pruefung, Zusammenfassung oder Routinekommunikation einzusetzen."

---

## Baustein 5 — Unternehmerhandbuch

**Intro:** Dieser Baustein misst, ob Ihre Firma als Ganzes verstaendlich beschrieben ist: Strategie, Struktur, Verantwortlichkeiten, Schluesselprozesse und Spielregeln. Ein Unternehmerhandbuch ist kein Hochglanzdokument, sondern die Betriebsanleitung fuer das Unternehmen.

### Frage 5.1
**Gibt es ein zentrales Dokument oder eine zentrale Wissensbasis, die beschreibt, wie Ihre Firma grundsaetzlich funktioniert?**

| Antwort-Option | Score |
|---|---:|
| Nein — dieses Wissen steckt vor allem im Kopf des Unternehmers | 0 |
| Ansatzweise — es gibt einzelne Dokumente, aber kein Gesamtbild | 25 |
| Teilweise — Struktur, Prozesse und Regeln sind verteilt dokumentiert | 50 |
| Ja, weitgehend — es gibt eine zentrale Beschreibung, aber sie ist nicht vollstaendig oder nicht immer aktuell | 75 |
| Ja — es gibt ein lebendes Unternehmerhandbuch, das regelmaessig genutzt und gepflegt wird | 100 |

### Frage 5.2
**Koennte ein neuer Geschaeftsfuehrer innerhalb von vier Wochen verstehen, wie Ihre Firma wirtschaftlich, organisatorisch und operativ funktioniert?**

| Antwort-Option | Score |
|---|---:|
| Nein — er waere massiv auf persoenliche Erklaerungen angewiesen | 0 |
| Nur grob — er wuerde viele Zusammenhaenge erst im Alltag lernen | 25 |
| Teilweise — die wichtigsten Zahlen und Strukturen waeren auffindbar | 50 |
| Ja, groesstenteils — mit Unterstuetzung koennte er schnell arbeitsfaehig werden | 75 |
| Ja — die Firma ist so dokumentiert, dass eine geordnete Uebergabe realistisch ist | 100 |

### Frage 5.3
**Wie gut sind Strategie, Zielkunden, Leistungsversprechen und Prioritaeten schriftlich festgehalten?**

| Antwort-Option | Score |
|---|---:|
| Gar nicht — das ist eher Gefuehl und Erfahrung | 0 |
| Eher schlecht — einzelne Aussagen existieren, aber nichts Belastbares | 25 |
| Teils-teils — manches ist beschrieben, aber nicht sauber verbunden | 50 |
| Eher gut — die wichtigsten Leitplanken sind dokumentiert | 75 |
| Sehr gut — Strategie, Zielgruppen, Angebot und Prioritaeten sind klar dokumentiert | 100 |

### Frage 5.4
**Wird vorhandene Unternehmensdokumentation im Alltag wirklich genutzt?**

| Antwort-Option | Score |
|---|---:|
| Nein — falls etwas existiert, liegt es nur irgendwo ab | 0 |
| Selten — meistens fragt man trotzdem direkt jemanden | 25 |
| Gelegentlich — einzelne Personen nutzen die Dokumente | 50 |
| Regelmaessig — bei Einarbeitung, Abstimmung oder Prozessfragen | 75 |
| Durchgehend — Dokumentation ist Teil der taeglichen Arbeitsweise | 100 |

### Stil-Anker Baustein 5

- **Score 0-30:** "Die Firma ist als Gesamtsystem noch zu wenig beschrieben. Solange Strategie, Struktur und Spielregeln vor allem im Kopf des Unternehmers liegen, bleibt KI nur punktuell einsetzbar."
- **Score 31-55:** "Es gibt bereits Bausteine eines Unternehmerhandbuchs, aber noch kein wirklich nutzbares Gesamtbild. Fuer Nachfolge, Skalierung und KI-Einsatz fehlt damit noch ein zentraler Orientierungsrahmen."
- **Score 56-100:** "Die Firma ist als Ganzes gut genug beschrieben, um darauf aufzubauen. Ein lebendes Unternehmerhandbuch kann spaeter zur Grundlage werden, damit KI Antworten, Analysen und Vorschlaege besser am Unternehmen ausrichtet."

---

## Baustein 6 — Workaround-Dunkelziffer

**Intro:** Dieser Baustein misst, wie viele inoffizielle Umgehungsloesungen Ihre Mitarbeiter nutzen, damit die Arbeit trotz Systemluecken weiterlaeuft. Workarounds sind oft praktisch, aber sie machen Prozesse unsichtbar, riskant und schwer automatisierbar.

### Frage 6.1
**Wie viele Excel-Listen, private Uebersichten oder Schatten-Dateien werden ungefaehr ausserhalb Ihrer offiziellen Systeme genutzt?**

| Antwort-Option | Score |
|---|---:|
| 0 bekannte Listen oder Schatten-Dateien | 100 |
| 1-3 Listen | 75 |
| 4-10 Listen | 50 |
| 11-20 Listen | 25 |
| Mehr als 20 Listen oder niemand weiss es genau | 0 |

### Frage 6.2
**Wie haeufig werden Daten aus einem System exportiert, manuell bearbeitet und dann woanders weiterverwendet?**

| Antwort-Option | Score |
|---|---:|
| Taeglich in mehreren Bereichen | 0 |
| Mehrmals pro Woche | 25 |
| Gelegentlich bei bestimmten Auswertungen oder Sonderfaellen | 50 |
| Selten — nur in klar begrenzten Ausnahmefaellen | 75 |
| Praktisch nie — Daten bleiben in den vorgesehenen Systemen | 100 |

### Frage 6.3
**Nutzen Mitarbeiter private oder nicht offiziell geregelte Tools fuer geschaeftliche Ablaeufe, zum Beispiel WhatsApp-Gruppen, private Google-Sheets, persoenliche To-do-Apps oder eigene Ablagen?**

| Antwort-Option | Score |
|---|---:|
| Ja, regelmaessig und in mehreren Bereichen | 0 |
| Ja, vereinzelt, aber es ist bekannt und wird geduldet | 25 |
| Teilweise — es gibt offizielle Tools, aber manche arbeiten daneben anders | 50 |
| Selten — einzelne Ausnahmen kommen vor | 75 |
| Nein — geschaeftliche Ablaeufe laufen ueber freigegebene Systeme | 100 |

### Frage 6.4
**Wer haette heute einen verlaesslichen Ueberblick darueber, welche Workarounds im Unternehmen tatsaechlich genutzt werden?**

| Antwort-Option | Score |
|---|---:|
| Niemand — das wuerde erst auffallen, wenn jemand ausfaellt | 0 |
| Einzelne Mitarbeiter kennen ihre eigenen Loesungen, aber kein Gesamtbild | 25 |
| Bereichsleiter kennen ungefaehr die wichtigsten Workarounds | 50 |
| Es gibt einen guten Ueberblick ueber die meisten Umgehungsloesungen | 75 |
| Workarounds werden aktiv erfasst, bewertet und entweder beseitigt oder offiziell geregelt | 100 |

### Stil-Anker Baustein 6

- **Score 0-30:** "Die Workaround-Dunkelziffer ist hoch. Das bedeutet: Die offiziellen Prozesse zeigen nicht die echte Arbeitsweise, und genau das macht KI-Einsatz gefaehrlich, weil wichtige Ablaeufe unsichtbar bleiben."
- **Score 31-55:** "Es gibt spuerbare Umgehungsloesungen, aber sie sind nicht voellig ausser Kontrolle. Bevor KI breiter eingesetzt wird, sollten die wichtigsten Schattenprozesse sichtbar gemacht und bewertet werden."
- **Score 56-100:** "Die Zahl der Workarounds wirkt beherrschbar. Das ist eine gute Voraussetzung, weil KI dann eher auf reale, geregelte Ablaeufe trifft und nicht auf versteckte Nebenprozesse."

---

## Editorische Hinweise

- Einige Antwortoptionen sind bewusst alltagsnah formuliert, damit Geschaeftsfuehrer ohne IT- oder KI-Vorwissen schnell eine ehrliche Selbsteinschaetzung abgeben koennen.
- Die Fragen vermeiden reine Ja/Nein-Antworten, damit Unterschiede zwischen chaotisch, teilweise strukturiert und belastbar strukturiert sichtbar werden.
- Die Workaround-Fragen sind absichtlich etwas unbequem formuliert, weil genau dort oft die groesste Luecke zwischen offizieller Prozesswelt und echter Arbeitsweise liegt.
- Die Schluss-Aussage ist bewusst einheitlich und nicht score-abhaengig formuliert. Sie soll keinen falschen Komfort erzeugen, sondern den Mandanten auf Strukturarbeit vor KI-Einsatz ausrichten.

---

## Anpassbarkeit (Architektur-Stand 2026-05-17)

**Heute moeglich:**
- Fragen, Antwort-Optionen, Score-Mappings und Stil-Anker liegen als JSONB in der DB-Tabelle `template` und sind **nicht im Code hartcodiert**.
- Aenderungen werden ueber eine neue Migration im Pattern von [sql/migrations/093_v63_partner_diagnostic_seed.sql](../sql/migrations/093_v63_partner_diagnostic_seed.sql) eingespielt — entweder als Update auf `version=v1` oder als neue Version (`version=v2`).
- Mehrere Templates parallel existieren bereits: `exit_readiness`, `mitarbeiter_wissenserhebung`, `partner_diagnostic`. Wechsel ueber den `slug`-Lookup im Worker-Branch.

**Heute NICHT moeglich (V7+ Architektur-Erweiterung noetig):**
- Per-Partner-Anpassung (jede Kanzlei eigene Fragen) — alle Partner sehen dasselbe `partner_diagnostic_v1`.
- Per-Mandant-Anpassung — fuer Self-Service-Werkzeug fachlich wahrscheinlich nicht sinnvoll, da die Diagnose vergleichbare Mess-Skala braucht.
- Admin-UI zum direkten Editieren der Fragen — heute geht jede Aenderung nur ueber Migration durch den Dev-Workflow.

Siehe Skill-Antwort 2026-05-17 fuer Optionen + Aufwand-Schaetzung.
