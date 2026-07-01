# M-01 Seed-Source — Geschäftsmodell & Werttreiber (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m01` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-01 ist die **geschäftsstrategische
> Standortbestimmung des Kanzlei-Geschäftsmodells** — Leistungsportfolio, Erlös-Mix
> (Compliance vs. Beratung), Marge/Honorar-Leckage, laufende Werttreiber, KI-Modellwandel,
> Zukunfts-Standort. Es ist eine **Selbst-Diagnose des Modells** (was verdient Geld, wo liegt
> Marge, wohin soll das Modell), **keine** betriebswirtschaftliche Einzelfallberatung und kein
> Ersatz für eine echte Bewertung/Beratung. Alle Fragen sind offene Selbst-Diagnose; die
> KI-Hebel analysieren/strukturieren. Keine erfundenen Zahlen. Dieser Framing-Hinweis gehört
> in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Geschäftsmodell / Werttreiber Steuerkanzlei (Führung & Struktur; StB-Begründung „Erlös-Mix
> Compliance vs. Beratung, Marge/Zeitfresser"). Blueprint-Anker: **primär** `a2_erloesmix_marge`
> + `g1_zukunftsstandort`, sekundär `f2_nachfolge`. Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein recyceltes
> exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m01` |
| `version` | `1.0` |
| `name` | M-01 – Geschäftsmodell & Werttreiber |
| Kategorie | Führung & Struktur (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m01` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 17 (9 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04-, M-06-, M-07-, M-26-, M-27-,
M-28-, M-35- und M-42-Seed (MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks
abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in
`question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M01-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (B1..B6 / Bxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-01 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell B1–B6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Modell-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-01-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m01`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| B1 | Geschäftsmodell & Leistungsportfolio | `b1a_kernleistungen_portfolio` | Kernleistungen & Umsatzanteile (FiBu/Lohn/Abschluss/Erklärung/Beratung/Spezial) |
| | | `b1b_geschaeftslogik` | Grundlogik — Volumen-/Zeitlogik vs. Wert-/Beratungslogik |
| | | `b1c_ertrags_klumpen` | Mandantenbasis als Ertragsbasis (Konzentration/Klumpen ertragsseitig) |
| B2 | Erlös-Mix: Compliance vs. Beratung | `b2a_compliance_beratung_split` | Umsatzanteil Pflicht-Compliance vs. echte Beratung |
| | | `b2b_beratung_abrechnung` | Beratung separat/wertbasiert abgerechnet vs. verschenkt |
| | | `b2c_zukunft_erloesmix` | Bewusste Verschiebung Richtung höherwertige Beratung |
| B3 | Marge, Honorar-Leckage & Rentabilität | `b3a_honorar_leckage` | Nicht abgerechnete Mehrleistung / Pro-bono-Drift |
| | | `b3b_leistungsrentabilitaet` | Rentable Leistungen/Mandate vs. Verlustbringer (Modell-Konsequenz) |
| | | `b3c_preis_wertlogik` | Honorar am Wert vs. am Aufwand (Grenze: Preisgestaltung/StBVV → M-09) |
| B4 | Werttreiber & Zeitfresser | `b4a_laufende_werttreiber` | Die 2–3 laufenden Werttreiber (Grenze: Übergabewert → M-35) |
| | | `b4b_zeitfresser_wertlos` | Tätigkeiten mit viel Zeit / wenig Wert |
| | | `b4c_skalierbarkeit` | Standardisierbar/produktisierbar (Grenze: KI-Systemwahl → M-36) |
| B5 | KI-/Struktur-Wandel des Modells | `b5a_ki_modell_effekt` | Umsatz-/Kapazitäts-Effekt, wenn KI Routine (FiBu) halbiert |
| | | `b5b_modell_anpassung` | Bewusste Anpassung des Modells an den Wandel |
| | | `b5c_neue_erloesquellen` | Neue Erlösquellen (Pakete, Retainer/Abo, digitale/Spezial-Leistungen) |
| B6 | Zukunfts-Standort & strategische Position | `b6a_strategische_position` | Position in 5 J. (übergabe-/aufkauffähig / spezialisiert-unabhängig / überrollt) |
| | | `b6b_konsolidierungs_exposure` | Konsolidierung (PE/Plattform-Kanzleien) — Chance vs. Bedrohung |
| | | `b6c_spezialisierung_fokus` | Spezialisierung/Nische als Zukunftsschutz (Grenze: Positionierungs-Botschaft → M-15) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M01-001 | `b1a_kernleistungen_portfolio` | Aus welchen Kernleistungen besteht Ihr Angebot heute (FiBu, Lohn, Jahresabschluss, Steuererklärung, betriebswirtschaftliche Beratung, Spezialthemen) — und wie grob verteilt sich Ihr Honorarumsatz darauf? | Ergänzung (Grenze: Umsatzbeitrag je Leistungsart als *Kennzahl* → M-07 F-M07-013; hier das Portfolio als Geschäftsmodell-Basis) |
| 2 | F-M01-002 | `b1b_geschaeftslogik` | Verdient Ihre Kanzlei im Kern über Menge und geleistete Zeit (Volumen-/Stundenlogik) oder über Wert und Ergebnis für den Mandanten (Beratungs-/Wertlogik) — und mit welcher Logik wollen Sie künftig wachsen? | Ergänzung |
| 3 | F-M01-003 | `b2a_compliance_beratung_split` | Wie verteilt sich Ihr Honorarumsatz zwischen Pflicht-Compliance (FiBu, Lohn, Abschluss, Erklärung) und echter betriebswirtschaftlicher Beratung? | Variante von F-BP-004 (M-BP diagnostiziert den Erlös-Mix in einer Frage; hier operative Vertiefung im primären Zielmodul m01; Abrechnungs-Hälfte → F-M01-004) |
| 4 | F-M01-004 | `b2b_beratung_abrechnung` | Wie viel Ihrer Beratungsleistung rechnen Sie tatsächlich separat und wertbasiert ab — und wie viel geben Sie faktisch kostenlos mit, weil es „im Mandat mit drin" ist? | Variante von F-BP-004 (die „separat abgerechnet"-Hälfte der a2-Frage; Grenze: Realisierungsgrad-Kennzahl → M-07 F-M07-003) |
| 5 | F-M01-005 | `b3a_honorar_leckage` | Wie viel Prozent Ihres Honorarpotenzials lassen Sie schätzungsweise liegen (Pro-bono-Drift, vergessene Mehrleistungen, zu späte/zu niedrige Rechnung) — und wissen Sie, an welchen Stellen es am meisten leckt? | Variante von F-BP-016 (Leckage-Teil, primär m01; Grenze: Realisierungsgrad-KPI → M-07 F-M07-003, Rechnungstaktung/Cash → M-06 F-M06-006) |
| 6 | F-M01-006 | `b4a_laufende_werttreiber` | Was sind die zwei, drei laufenden Werttreiber Ihrer Kanzlei — das, womit Sie heute wirklich Geld verdienen und was Sie von anderen abhebt — und wie bewusst bauen Sie diese aus? | Ergänzung (Grenze: Übergabe-/Praxiswert → M-35 F-M35-007; hier die *laufenden* Werttreiber, wohin M-35 explizit defert) |
| 7 | F-M01-007 | `b6a_strategische_position` | Die Branche konsolidiert (PE-Aufkäufe, Plattform-Kanzleien) bei gleichzeitigem KI-Umbruch — wo sehen Sie Ihre Kanzlei in 5 Jahren: übergabe-/aufkauffähig, spezialisiert-unabhängig, oder vom Wandel überrollt? | Variante von F-BP-015 (g1-Diagnose; hier primäres Zielmodul m01, operative Vertiefung) |
| 8 | F-M01-008 | `b6b_konsolidierungs_exposure` | Ist die Marktkonsolidierung für Sie eher Chance (verkaufen, andocken, selbst aufkaufen) oder Bedrohung (überrollt werden) — und haben Sie dazu schon eine bewusste Haltung/Strategie, oder läuft es nebenher? | Ergänzung (Grenze: das persönliche Loslassen/Übergabe-*Wollen* → M-42; hier die geschäftsstrategische Position) |
| 9 | F-M01-009 | `b5a_ki_modell_effekt` | Was passiert mit Ihrem Umsatzmodell, wenn KI in den nächsten Jahren Ihre FiBu-/Routine-Zeit halbiert — bricht Umsatz weg, oder verschiebt sich Kapazität in höherwertige Beratung? | Variante von F-BP-016 (KI-Effekt-Teil der a2-Frage; hier als Geschäftsmodell-Frage vertieft; Grenze: KI-Systemwahl/Tools → M-36, Personalbedarf-Effekt → M-26 F-M26-019) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M01-010 | `b1c_ertrags_klumpen` | Wie stark hängt Ihr Umsatz an wenigen großen Mandaten oder einer einzelnen Branche — und was würde ein Wegbrechen der drei größten Mandate für Ihr Geschäftsmodell bedeuten? | Ergänzung (Grenze: Schlüsselperson-/Personal-Klumpen → M-26 F-M26-007; hier der *ertragsseitige* Mandantenklumpen) |
| 11 | F-M01-011 | `b2c_zukunft_erloesmix` | Wollen Sie Ihren Erlös-Mix bewusst Richtung höherwertige Beratung verschieben — und wenn ja, um welche konkreten Leistungen/Pakete und in welchem Zeithorizont? | Ergänzung (Grenze: Mandanten-*Erwartung*/Nachfrage → M-BP c1 / M-15; hier die modellseitige Weichenstellung) |
| 12 | F-M01-012 | `b3b_leistungsrentabilitaet` | Welche Ihrer Leistungsarten oder Mandatstypen sind wirklich rentabel und welche Verlustbringer — und ziehen Sie daraus Konsequenzen (ausbauen, anders bepreisen, abgeben)? | Variante von F-M07-006 (M-07: Rentabilitäts-*Transparenz* je Mandat/Leistung; hier die *Portfolio-/Modell-Konsequenz* daraus) |
| 13 | F-M01-013 | `b3c_preis_wertlogik` | Orientiert sich Ihr Honorar eher am Aufwand/an der Zeit oder am Wert/Nutzen für den Mandanten — und wo könnten Sie für dieselbe Leistung mehr verlangen, ohne einen Mandanten zu verlieren? | Ergänzung (Grenze: detaillierte Preisgestaltung/StBVV → M-09, nicht im Cut; hier die grundsätzliche Wertlogik) |
| 14 | F-M01-014 | `b4b_zeitfresser_wertlos` | Welche Tätigkeiten fressen bei Ihnen und im Team viel Zeit, ohne echten Wert für Mandant oder Kanzlei zu schaffen — und was davon ließe sich streichen, automatisieren oder abgeben? | Ergänzung (Grenze: produktive Team-Quote/Kapazität → M-26 F-M26-015; Systemwahl → M-36; hier der Modell-/Wert-Blick) |
| 15 | F-M01-015 | `b4c_skalierbarkeit` | Welche Teile Ihres Angebots ließen sich standardisieren oder produktisieren (feste Pakete, wiederholbare Beratungsformate), sodass Sie mit weniger individuellem Aufwand mehr erreichen? | Ergänzung (Grenze: konkrete Tool-/KI-Systemwahl → M-36; hier der Geschäftsmodell-Hebel Skalierbarkeit) |
| 16 | F-M01-016 | `b5c_neue_erloesquellen` | Sehen Sie neue oder zusätzliche Erlösquellen jenseits des klassischen Mandats (Beratungspakete, Abo-/Retainer-Modelle, digitale Leistungen, Spezial-/Branchenberatung) — und probieren Sie davon schon etwas aus? | Ergänzung |
| 17 | F-M01-017 | `b6c_spezialisierung_fokus` | Ist Spezialisierung (Branche, Leistung, Nische) für Sie ein Weg, im Wandel unabhängig und gefragt zu bleiben — und haben Sie einen Fokus, oder machen Sie eher „alles für alle"? | Ergänzung (Grenze: die Positionierungs-*Botschaft*/Außenkommunikation → M-15; hier die strategische Modell-Weichenstellung) |

> **Auto-Dedup-Befund:** M-01 (Geschäftsmodell & Werttreiber) liegt bewusst **im Zentrum des
> Finanzen-/KPI-/Blueprint-Clusters** und ist daher nicht frisch: **4 Varianten**, 13 Ergänzungen.
> Die Varianten liegen auf den Fragen, deren *primäres* Zielmodul m01 ist (`a2_erloesmix_marge`,
> `g1_zukunftsstandort`): **F-M01-003/004 ↔ F-BP-004** (Erlös-Mix + Beratungs-Abrechnung),
> **F-M01-005 ↔ F-BP-016** (Honorar-Leckage), **F-M01-009 ↔ F-BP-016** (KI-Modelleffekt),
> **F-M01-007 ↔ F-BP-015** (Zukunfts-Standort) und **F-M01-012 ↔ F-M07-006** (Rentabilität → hier
> als Modell-Konsequenz). Der Blueprint **diagnostiziert** Modell/Erlös/Zukunft je in einer Frage;
> M-01 **vertieft** sie operativ. Grenzen sauber gezogen: **M-04** (Finanz-*Steuerung*/a1 —
> M-01 = das Modell dahinter), **M-07** (Rentabilitäts-/Umsatz-*Kennzahlen* — M-01 = die
> Modell-Konsequenz), **M-06** (Rechnungstaktung/Cash-Timing), **M-35** (Übergabe-/Praxiswert —
> M-01 = *laufende* Werttreiber, wohin M-35 F-M35-007 explizit defert), **M-42** (Loslass-*Wollen*
> — M-01 = geschäftsstrategische Zukunftsposition), **M-15** (Positionierungs-*Botschaft*),
> **M-08** (Akquise/Zielkunden), **M-36** (KI-*Systemwahl*), **M-09/M-46** (Preisgestaltung/StBVV,
> Selbstorganisation — nicht im Cut). **Bewusst gedeckelt** (Founder-Entscheid „schlanker", nicht
> stillschweigend gefüllt): `b5b_modell_anpassung` ist im Themenbaum angelegt, aber in v1.0 ohne
> eigene Frage (der Anpassungs-Intent liegt implizit in F-M01-009/011/016) — v1.1-Kandidat.
> DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M01-001 | Erlös-Mix-Analyse (Honorarumsatz nach Compliance vs. Beratung + Leistungsart aufschlüsseln, Verschiebungs-Szenarien) | 2 | B2; F-M01-003, F-M01-011 |
| H-M01-002 | Honorar-Leckage-Radar (Pro-bono-Drift, vergessene Mehrleistungen, Unterabrechnung sichtbar + Rückgewinnungspotenzial) | 2 | B3a; F-M01-005 (Grenze: Realisierungsgrad-KPI = H-M07-002) |
| H-M01-003 | Leistungs-/Mandats-Rentabilitäts-Portfolio (Träger vs. Verlustbringer → Ausbauen/Abbauen/Umpreisen-Empfehlung) | 3 | B3b; F-M01-012 (verwandt H-M07-006 — hier Modell-Konsequenz) |
| H-M01-004 | Wert-/Preislogik-Assistent (aufwands- vs. wertbasierte Honorierung, Preissetzungs-Spielräume aufzeigen) | 2 | B3c; F-M01-013 |
| H-M01-005 | Werttreiber-/Zeitfresser-Landkarte (was schafft Wert vs. frisst Zeit — Standardisierungs-/Automatisierungs-Kandidaten) | 3 | B4; F-M01-006, F-M01-014, F-M01-015 |
| H-M01-006 | KI-Modell-Effekt-Simulator (Umsatz-/Kapazitäts-Effekt, wenn KI Routine halbiert; Verschiebung in Beratung durchrechnen) | 3 | B5a; F-M01-009 |
| H-M01-007 | Neue-Erlösquellen-/Produktisierungs-Ideengeber (Pakete, Retainer, digitale/Spezial-Leistungen fürs Portfolio) | 2 | B4c/B5c; F-M01-015, F-M01-016 |
| H-M01-008 | Zukunfts-Standort-Radar (strategische Position im Konsolidierungs-/KI-Wandel; Szenarien übergabefähig/spezialisiert/überrollt + Weichenstellungen) | 4 | B6; F-M01-007, F-M01-008, F-M01-017 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-01-Output):** geschäftsstrategische Selbst-Diagnose des
> Kanzlei-Modells, **keine** betriebswirtschaftliche Einzelfallberatung und kein Ersatz für
> eine fundierte Bewertung. Die Ausgabe strukturiert die eigenen Angaben und macht
> Modell-/Wert-Hebel sichtbar.

Aus den M-01-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Erlös-Mix Richtung Beratung verschieben,
  Verlustbringer-Leistung abbauen/umpreisen, Beratung konsequent separat abrechnen, eine
  strategische Zukunftsposition/Spezialisierung wählen, sich für/gegen Konsolidierungs-Andocken
  entscheiden).
- `standard` — welche Norm/Routine gilt (z. B. regelmäßige Erlös-Mix-/Rentabilitäts-Betrachtung,
  konsequente Abrechnung von Mehrleistung, definierte Werttreiber mit Ausbauplan, wert- statt
  aufwandsbasierte Honorarlogik, jährliche Standort-/Strategie-Review).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Erlös-Mix-Analyse erstellen,
  Leckage-Stellen benennen und schließen, ein Beratungspaket definieren und bepreisen, ein
  Standardisierungs-/Produktisierungs-Kandidat aufsetzen, Zukunfts-Szenarien durchspielen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m01`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
