# M-35 Seed-Source — Gesellschafts-, Nachfolge- & Gesellschafterverträge (SLC-170b, Welle 4)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m35` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten` + DATEV-Abgrenzung):** M-35 ist eine **operative
> Standortbestimmung** („ist geregelt / aktuell / deckt X ab / wo ist die Lücke") — **KEINE
> Rechtsberatung**. Die eigentliche vertragliche Gestaltung gehört zu Notar / Fachanwalt /
> Berufsrecht. Alle Fragen sind Selbst-Diagnose, die Lücken sichtbar macht; die KI-Hebel
> strukturieren/prüfen, **ersetzen aber keine anwaltliche/notarielle Beratung**. Keine erfundenen
> Rechtsfakten. Dieser Disclaimer gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE + Privat-Verzahnung-Scope
> Founder-bestätigt); Domänen-Struktur Gesellschafts-/Nachfolgerecht Steuerkanzlei (Recht & Verträge,
> „Nachfolge-Eingang A"). Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-04/M-06/M-BP/M-26/M-27/M-28-seed-source.md`. Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **24 Fragen (11 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m35` |
| `version` | `1.0` |
| `name` | M-35 – Gesellschafts-, Nachfolge- & Gesellschafterverträge |
| Kategorie | Recht & Verträge (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m35` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 24 (11 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04-, M-06-, M-26-, M-27- und M-28-Seed
(MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte
„Ebene" (Kern/Workspace) landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M35-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (G1..G6 / Gxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-35 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell G1–G6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Disclaimer | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Rechtsberatungs-Disclaimer (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-35-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m35`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| G1 | Rechtsform & Gesellschaftsvertrag | `g1a_rechtsform` | Rechtsform (Einzelkanzlei/GbR/PartG/PartGmbB/StB-GmbH) & Passung |
| | | `g1b_gv_aktualitaet` | Gesellschaftsvertrag vorhanden & aktuell (gelebt vs. Schublade) |
| | | `g1c_berufsrecht_konformitaet` | Berufsrechts-Konformität (StBerG: Berufsträger-Beteiligung/-Mehrheit) |
| G2 | Gesellschafter-Struktur & Beschlussfassung | `g2a_beteiligung_stimmrechte` | Beteiligungsverhältnisse, Stimmrechte, Gewinnverteilung |
| | | `g2b_konfliktregelung` | Konflikt-/Deadlock-Regelung (Schlichtung, Hinauskündigung) |
| G3 | Nachfolge-Regelung (Eingang A) | `g3a_nachfolge_geregelt` | Ist die Nachfolge überhaupt vertraglich geregelt |
| | | `g3b_weg_horizont` | Weg (intern/extern/Verkauf/Zusammenschluss) & Zeithorizont |
| | | `g3c_nachfolgeklauseln` | Nachfolge-/Fortsetzungsklauseln im Vertrag |
| G4 | Ein-/Austritt & Anteilsbewertung | `g4a_ein_austritt` | Aufnahme/Ausscheiden von Gesellschaftern (Regeln, Andienung) |
| | | `g4b_bewertung_abfindung` | Anteilsbewertung & Abfindung (Methode, Deckelung, Auszahlung) |
| G5 | Notfall-/Ausfallvorsorge (Tod/BU/Krankheit) | `g5a_vertreterregelung` | Vertreterregelung §69 StBerG (Praxis-/Berufsträger-Ausfall) |
| | | `g5b_erbfolge_testament` | Erbfolge/Testament bzgl. Kanzlei (verhindert Zersplitterung an Erben) |
| | | `g5c_vollmachten_notfall` | Vollmachten & Not-Nachfolger (kurzfristige Handlungsfähigkeit) |
| G6 | Praxiswert, Übergabe-Konditionen & Privat-Verzahnung | `g6a_praxiswert` | Praxiswert/Bewertung (Basis für Kaufpreis/Übergabewert) |
| | | `g6b_uebergabe_konditionen` | Übergabe-Konditionen (Mandantenübertragung, Wettbewerbsverbot, Earn-out, Übergangsphase) |
| | | `g6c_privat_verzahnung` | Ehe-/Güterstand-/Erbrecht-Wirkung auf Kanzleianteile |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-BP/M-26/M-27/M-28-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 11 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M35-001 | `g1a_rechtsform` | In welcher Rechtsform führen Sie Ihre Kanzlei (Einzelkanzlei, GbR/Sozietät, PartG/PartGmbB, StB-GmbH) — und passt diese Form noch zu Größe, Haftungslage und Nachfolgeabsicht? | Ergänzung |
| 2 | F-M35-002 | `g1b_gv_aktualitaet` | Gibt es eine geregelte vertragliche Grundlage (bei mehreren Gesellschaftern: Gesellschaftsvertrag) — und wann wurde sie zuletzt an die heutige Realität angepasst, oder liegt sie unverändert in der Schublade? | Ergänzung |
| 3 | F-M35-003 | `g3a_nachfolge_geregelt` | Ist Ihre Nachfolge vertraglich/rechtlich überhaupt geregelt — oder existiert sie bisher nur als Absicht im Kopf? | Ergänzung |
| 4 | F-M35-004 | `g3b_weg_horizont` | Welchen Nachfolge-Weg verfolgen Sie (interne Nachfolge, Verkauf, Zusammenschluss/Partneraufnahme) und in welchem Zeithorizont — und ist dieser Weg schon vertraglich unterlegt oder erst Idee? | Variante von F-BP-014 (M-BP: Nachfolge-Strategie diagnostisch; hier operative vertragliche Vertiefung) |
| 5 | F-M35-005 | `g4b_bewertung_abfindung` | Ist geregelt, wie ein Gesellschafteranteil bei Aus-/Eintritt bewertet und abgefunden wird (Methode, Deckelung, Auszahlungsmodus) — oder wäre das im Ernstfall Streitstoff? | Ergänzung |
| 6 | F-M35-006 | `g5a_vertreterregelung` | Ist für Ihren Ausfall eine berufsrechtliche Vertreterregelung (§69 StBerG) getroffen — ein bestellter/vereinbarter Praxisvertreter, der die Kanzlei fortführen dürfte? | Ergänzung (Grenze: die Ausfall-/Zeichnungs-*Realität* = M-26 F-M26-021; hier die rechtliche Regelung) |
| 7 | F-M35-007 | `g6a_praxiswert` | Kennen Sie den ungefähren Wert Ihrer Kanzlei als Übergabeobjekt und wissen Sie, worauf er sich stützt (Umsatz, Mandantenstruktur, Inhaberabhängigkeit) — oder ist das offen? | Variante von F-BP-014 (Übergabewert-Teil; Grenze: laufende Werttreiber → M-01) |
| 8 | F-M35-008 | `g5b_erbfolge_testament` | Ist im Todesfall geregelt, was mit Ihrer Kanzlei/Ihren Anteilen passiert (Testament, erbrechtliche Nachfolgeklausel) — oder fiele die Kanzlei an eine Erbengemeinschaft, die sie nicht fortführen kann? | Ergänzung |
| 9 | F-M35-009 | `g5c_vollmachten_notfall` | Gibt es Vollmachten/Notfall-Regelungen, die kurzfristige Handlungsfähigkeit sichern, wenn Sie plötzlich ausfallen (Bank, Mandanten, Behörden, Fristen)? | Ergänzung |
| 10 | F-M35-010 | `g3c_nachfolgeklauseln` | Enthält Ihr Gesellschafts-/Praxisvertrag konkrete Nachfolge-/Fortsetzungsklauseln (was mit dem Anteil bei Ausscheiden/Tod passiert) — oder schweigt der Vertrag dazu? | Ergänzung |
| 11 | F-M35-011 | `g6b_uebergabe_konditionen` | Falls ein Verkauf/eine Übergabe ansteht: Sind die Konditionen durchdacht (Mandantenübertragung, Wettbewerbsverbot, Kaufpreis/Earn-out, Übergangsphase mit Ihnen) — oder ist das noch weißes Blatt? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 12 | F-M35-012 | `g1a_rechtsform` | Wenn Sie heute neu gründen würden: Wäre Ihre jetzige Rechtsform noch die richtige — oder tragen Sie eine Form mit, die aus Haftungs-/Nachfolgesicht nicht mehr passt? | Ergänzung |
| 13 | F-M35-013 | `g1c_berufsrecht_konformitaet` | Ist Ihre Gesellschafterstruktur berufsrechtskonform (StBerG-Anforderungen an Berufsträger-Beteiligung/-Mehrheit) — auch mit Blick auf einen künftigen Partner/Nachfolger? | Ergänzung |
| 14 | F-M35-014 | `g2a_beteiligung_stimmrechte` | Bei mehreren Gesellschaftern: Wie sind Beteiligung, Stimmrechte und Gewinnverteilung geregelt — und passt das noch zum tatsächlichen Beitrag jedes Partners? | Ergänzung (Grenze: Entscheidungs-/Governance-Prozesse → M-03) |
| 15 | F-M35-015 | `g2b_konfliktregelung` | Gibt es für den Streit-/Pattfall eine Regelung (Schlichtung, Hinauskündigung, Deadlock-Auflösung) — oder wäre ein Gesellschafterkonflikt existenzbedrohend? | Ergänzung |
| 16 | F-M35-016 | `g4a_ein_austritt` | Ist geregelt, wie ein neuer Partner aufgenommen bzw. ein Gesellschafter ausscheiden kann (Fristen, Bedingungen, Andienungspflicht) — oder müsste das frei verhandelt werden? | Ergänzung |
| 17 | F-M35-017 | `g4b_bewertung_abfindung` | Nach welcher Methode würde ein Anteil bewertet (Umsatzmethode, Ertragswert, festes Schema) — und ist die Abfindung so gestaltet, dass sie die Kanzlei-Liquidität nicht sprengt? | Ergänzung |
| 18 | F-M35-018 | `g5b_erbfolge_testament` | Sind Ihr Testament/Ehevertrag und Ihr Gesellschaftsvertrag aufeinander abgestimmt (keine widersprüchlichen Nachfolgeregelungen) — oder haben Sie das nie zusammen betrachtet? | Ergänzung |
| 19 | F-M35-019 | `g6a_praxiswert` | Welche drei Faktoren würden heute Ihren Übergabewert am stärksten drücken (Inhaberabhängigkeit, Mandantenkonzentration, Digitalisierungsrückstand) — und tun Sie etwas dagegen? | Variante von F-BP-014 (die „3-Faktoren-Übergabewert"-Frage aus dem Blueprint; hier operativ vertieft) |
| 20 | F-M35-020 | `g6b_uebergabe_konditionen` | Haben Sie eine Vorstellung von der Übergangsphase (wie lange begleiten Sie den Nachfolger, wie werden Mandanten übergeleitet, wann ziehen Sie sich zurück)? | Ergänzung (Grenze: das persönliche Loslassen → M-42) |
| 21 | F-M35-021 | `g6c_privat_verzahnung` | Wirkt sich Ihr Güterstand/Ehevertrag auf Ihre Kanzleianteile aus (Zugewinnausgleich im Scheidungs-/Todesfall) — und ist das bewusst geregelt? | Ergänzung |
| 22 | F-M35-022 | `g1b_gv_aktualitaet` | Lebt Ihr Gesellschaftsvertrag die Realität (tatsächliche Rollen, Gewinnverteilung, Entscheidungswege) — oder weicht die gelebte Praxis vom Papier ab? | Ergänzung |
| 23 | F-M35-023 | `g3b_weg_horizont` | Haben Sie mit den Betroffenen (möglicher Nachfolger, Partner, Familie) über Ihren Nachfolge-Weg gesprochen — oder ist der Plan bisher nur Ihrer? | Ergänzung (Grenze: persönliches Loslassen → M-42) |
| 24 | F-M35-024 | `g5a_vertreterregelung` | Wenn Sie morgen für längere Zeit ausfielen: Wäre rechtlich in Stunden geklärt, wer die Kanzlei fortführt und zeichnet — oder gäbe es ein Vakuum mit Fristen-/Haftungsrisiko? | Ergänzung (scharfe Aha-Frage; Grenze: Kapazitäts-/Zeichnungsrealität → M-26 F-M26-021) |

> **Auto-Dedup-Befund:** M-35 (Gesellschafts-/Nachfolgerecht) ist gegenüber dem gesamten Korpus
> weitgehend frisch — 21 der 24 Fragen sind **Ergänzungen**. Die **3 Varianten** liegen alle auf
> **F-BP-014** (die Blueprint-Nachfolge-Frage, die primär auf m35 routet): F-M35-004 (Weg/Horizont),
> F-M35-007 (Wert kennen) und F-M35-019 (die „3 Faktoren, die den Übergabewert drücken" — 1:1 aus
> F-BP-014, hier operativ). Der Blueprint **diagnostiziert** die Nachfolge in einer Frage; M-35
> **vertieft** sie über die volle Rechts-/Vertragsdimension. Grenzen sauber gezogen: **M-42**
> (persönliches Loslassen — f1), **M-26 P6/F-M26-009/021** (personelle Nachfolge-Verfügbarkeit +
> §69-Kapazitätsrealität — M-35 hält die *rechtliche* Regelung), **M-01** (laufende Werttreiber vs.
> Übergabewert), **M-03** (Governance/Entscheidungsprozesse). M-31/32/33/34 (allgemeine Verträge)
> sind nicht im Cut — M-35 bleibt strikt auf Gesellschafts-/Nachfolge. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

> Alle Hebel sind **strukturierend/prüfend** und **ersetzen keine anwaltliche/notarielle Beratung**
> (siehe Disclaimer §6).

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M35-001 | Nachfolge-Fahrplan-Generator (Weg + Zeitachse + Meilensteine + wer wann einzubinden) | 2 | G3; F-M35-003, F-M35-004 |
| H-M35-002 | Vertrags-Lücken-Check Gesellschaftsvertrag (fehlende Nachfolge-/Ausscheidens-/Deadlock-Klauseln aufdecken) | 2 | G1b/G2b/G3c; F-M35-002, F-M35-010, F-M35-015 |
| H-M35-003 | Notfall-/Ausfall-Vorsorge-Checkliste (§69-Vertreter, Vollmachten, Fristen-Handlungsfähigkeit) | 2 | G5; F-M35-006, F-M35-009, F-M35-024 |
| H-M35-004 | Rechtsform-Passungs-Check (aktuelle Form vs. Größe/Haftung/Nachfolgeziel) | 2 | G1a/G1c; F-M35-001, F-M35-013 |
| H-M35-005 | Praxiswert-Indikation (grobe Bewertung + Werttreiber/-drücker sichtbar) | 3 | G6a; F-M35-007, F-M35-019 |
| H-M35-006 | Übergabewert-Optimierungs-Assistent (welche Faktoren senken den Wert, konkrete Gegenmaßnahmen) | 3 | G6a; F-M35-019 |
| H-M35-007 | Anteilsbewertungs-/Abfindungs-Simulator (Methode durchrechnen, Deckelung, Liquiditätswirkung) | 3 | G4b; F-M35-005, F-M35-017 |
| H-M35-008 | Erb-/Vertrags-Konsistenz-Check (Testament/Ehevertrag vs. Gesellschaftsvertrag auf Widersprüche) | 3 | G5b/G6c; F-M35-008, F-M35-018, F-M35-021 |
| H-M35-009 | Dokument-/Fristen-Tresor Nachfolge (Verträge/Vollmachten zentral, Ablauf-/Review-Erinnerung) | 2 | G1b/G5c; F-M35-002, F-M35-009 |
| H-M35-010 | Übergabe-Konditionen-Konfigurator (Wettbewerbsverbot, Earn-out, Übergangsphase strukturieren) | 3 | G6b; F-M35-011, F-M35-020 |
| H-M35-011 | Nachfolge-Reifegrad-Radar (Gesamtbild Übergabefähigkeit über alle Rechts-/Vertragsdimensionen) | 4 | G1–G6; F-M35-003, F-M35-006, F-M35-007 |

## 6. Output-Contract (`metadata.output_contract`)

> **Disclaimer (Pflicht in jedem M-35-Output):** operative Standortbestimmung, **keine
> Rechtsberatung**. Konkrete Gestaltung erfordert Notar / Fachanwalt / Berufsrecht.

Aus den M-35-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Rechtsform anpassen, Nachfolge-Weg festlegen, §69-Vertreter bestellen, Testament/Gesellschaftsvertrag harmonisieren, Bewertungsmethode für Anteile vereinbaren).
- `standard` — welche Norm/Routine gilt (z. B. aktueller Gesellschaftsvertrag mit Nachfolge-/Deadlock-/Bewertungsklauseln, dokumentierte Notfall-/Vertreterregelung, regelmäßiger Vertrags-Review, abgestimmte erb-/gesellschaftsrechtliche Regelung).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Termin bei Notar/Fachanwalt, Vertrags-Lücken-Check durchführen, §69-Vertreter benennen, Vollmachten hinterlegen, Praxiswert-Indikation erstellen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m35`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
