# M-07 Seed-Source — KPI-Set & Reporting-Struktur (SLC-170b, Welle 3)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m07` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE-Schnitt Founder-bestätigt;
> K2 Realisierung/Auslastung + K3b Mandanten-Rentabilität bewusst Kern). Domänen-Struktur
> Kanzlei-Kennzahlen/Reporting. Tiefen-/Format-Maßstab + Auto-Dedup-Korpus: `M-04-seed-source.md`.
> Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **22 Fragen (9 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m07` |
| `version` | `1.0` |
| `name` | M-07 – KPI-Set & Reporting-Struktur |
| Kategorie | Finanzen & Controlling (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m07` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 22 (9 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`- und M-04-Seed (MIG-029 / MIG-125).
Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace)
landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M07-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (K1..K6 / Kxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-07 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell K1–K6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-07-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später, wie M-04).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m07`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| K1 | Kennzahlen-Set & Definition | `k1a_steuerungs_kpis` | Steuerungs-KPIs (welche Zahlen steuern die Kanzlei) |
| | | `k1b_kpi_definition` | KPI-Definition / Eindeutigkeit (rechnet jeder gleich) |
| | | `k1c_finanziell_operativ` | Finanziell vs. operativ (Balance der Kennzahlen) |
| K2 | Produktivität & Realisierung | `k2a_realisierungsgrad` | Realisierungsgrad (verrechenbar/geleistet, Honorar-Leckage) |
| | | `k2b_auslastung` | Produktive Auslastung je Mitarbeiter |
| | | `k2c_zeiterfassung` | Zeit-/Leistungserfassung als Grundlage |
| K3 | Umsatz & Rentabilität | `k3a_umsatz_kopf` | Umsatz je Kopf / je Mandat |
| | | `k3b_rentabilitaet` | Mandanten-/Leistungs-Rentabilität (Deckungsbeitrag) |
| | | `k3c_wip_offene_leistung` | Offene Leistungen / WIP-Transparenz |
| K4 | Reporting-Struktur & Taktung | `k4a_report_set` | Report-Set & Empfänger |
| | | `k4b_reporting_ritual` | Frequenz & Ritual (Steuerungsmeeting) |
| | | `k4c_dashboard` | Dashboard vs. manuell |
| K5 | Ziele, Soll-Werte & Benchmarks | `k5a_zielwerte` | Zielwerte / Soll je KPI |
| | | `k5b_abweichungs_reaktion` | Abweichungs-Reaktion / Maßnahme |
| | | `k5c_benchmark` | Benchmark (Vorjahr / Plan / Branche) |
| K6 | Datengrundlage & KPI-Governance | `k6a_datenquelle` | Datenquelle & Verlässlichkeit |
| | | `k6b_kpi_owner` | KPI-Owner & Pflege |
| | | `k6c_automatisierung` | Automatisierung der Erhebung |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M07-001 | `k1a_steuerungs_kpis` | Welche 3–5 Kennzahlen schauen Sie an, um zu beurteilen, ob Ihre Kanzlei operativ gut läuft — und steuern Sie tatsächlich danach oder schauen Sie sie nur an? | Variante von F-M04-003/012/015 (Steuerungslogik → hier: konkretes KPI-Set inkl. Produktivität) |
| 2 | F-M07-002 | `k1b_kpi_definition` | Sind diese Kennzahlen eindeutig definiert — würden Sie, Ihre Partner und Ihr Team dieselbe Zahl gleich berechnen — oder gibt es je nach Quelle unterschiedliche Werte? | Ergänzung |
| 3 | F-M07-003 | `k2a_realisierungsgrad` | Kennen Sie Ihren Realisierungsgrad — welcher Anteil der geleisteten Beraterstunden am Ende tatsächlich als Honorar abgerechnet wird — und wo geht regelmäßig Honorar verloren? | Ergänzung |
| 4 | F-M07-004 | `k2b_auslastung` | Wissen Sie, wie ausgelastet Ihre einzelnen Mitarbeiter/Berater sind (produktive vs. gesamte Stunden) — und erkennen Sie Über- oder Unterlast früh genug? | Ergänzung |
| 5 | F-M07-005 | `k3a_umsatz_kopf` | Kennen Sie Ihren Umsatz je Kopf (und ggf. je Mandat) — und wie hat er sich in den letzten Jahren entwickelt? | Ergänzung |
| 6 | F-M07-006 | `k3b_rentabilitaet` | Wissen Sie, welche Mandate oder Leistungsarten für Sie wirklich profitabel sind und welche Sie draufzahlen — oder ist das eher Bauchgefühl? | Ergänzung |
| 7 | F-M07-007 | `k4a_report_set` | Welche regelmäßigen Auswertungen/Reports gibt es in Ihrer Kanzlei, und wer bekommt sie — nur Sie, die Partner, auch die Teamleitung? | Ergänzung |
| 8 | F-M07-008 | `k4b_reporting_ritual` | Gibt es ein festes Ritual (z. B. monatlicher Termin), in dem diese Kennzahlen besprochen und Maßnahmen abgeleitet werden — oder werden Reports erstellt und dann abgelegt? | Variante von F-M04-009/023 (Taktung/Steuerungsmeetings → hier: Kennzahlen-Reporting) |
| 9 | F-M07-009 | `k5a_zielwerte` | Haben Ihre wichtigsten Kennzahlen konkrete Zielwerte (Soll), gegen die Sie den Ist messen — oder schauen Sie nur den Ist-Wert ohne Zielmarke an? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M07-010 | `k1c_finanziell_operativ` | Bilden Ihre Kennzahlen sowohl die finanzielle (Umsatz, Marge) als auch die operative Seite (Durchlaufzeit, Auslastung, Qualität) ab — oder liegt der Fokus einseitig? | Ergänzung |
| 11 | F-M07-011 | `k2c_zeiterfassung` | Wie verlässlich erfassen Ihre Leute geleistete Zeit/Leistungen — vollständig und zeitnah, oder lückenhaft/nachträglich geschätzt? | Ergänzung |
| 12 | F-M07-012 | `k2a_realisierungsgrad` | Wo entsteht bei Ihnen die meiste nicht abgerechnete Leistung (Nacharbeit, Kulanz, vergessene Zusatzleistungen, Pauschalen die nicht mehr passen)? | Ergänzung |
| 13 | F-M07-013 | `k3a_umsatz_kopf` | Kennen Sie den Umsatz-/Ergebnisbeitrag je Leistungsart (FiBu, Lohn, Abschluss, Beratung) — und wissen Sie, womit Sie wachsen wollen? | Ergänzung |
| 14 | F-M07-014 | `k3c_wip_offene_leistung` | Haben Sie Transparenz über offene, noch nicht abgerechnete Leistungen (WIP) — und wie alt werden diese, bevor sie zu Honorar werden? | Ergänzung |
| 15 | F-M07-015 | `k4c_dashboard` | Sehen Sie Ihre Kennzahlen in einem aktuellen Dashboard/Cockpit — oder werden sie manuell aus DATEV/Tabellen zusammengetragen, wenn Sie sie brauchen? | Ergänzung |
| 16 | F-M07-016 | `k5b_abweichungs_reaktion` | Was passiert konkret, wenn eine Kennzahl vom Ziel abweicht — gibt es eine definierte Reaktion/Maßnahme, oder bleibt es bei der Feststellung? | Ergänzung |
| 17 | F-M07-017 | `k5c_benchmark` | Vergleichen Sie Ihre Kennzahlen mit Vorjahr, Plan oder Branchen-Benchmarks — und wissen Sie, wo Sie im Branchenvergleich stehen (z. B. Umsatz/Kopf)? | Ergänzung |
| 18 | F-M07-018 | `k6a_datenquelle` | Aus welchen Quellen kommen Ihre Kennzahlen (DATEV, Zeiterfassung, Excel) — und wie sehr vertrauen Sie den Zahlen, ohne sie zu prüfen? | Ergänzung |
| 19 | F-M07-019 | `k6b_kpi_owner` | Wer in Ihrer Kanzlei ist dafür verantwortlich, dass die Kennzahlen richtig, aktuell und einheitlich sind — oder macht das nebenbei jeder/keiner? | Ergänzung |
| 20 | F-M07-020 | `k6c_automatisierung` | Wie viel manueller Aufwand steckt heute im Erstellen Ihres Reportings — und was davon ließe sich automatisieren? | Ergänzung |
| 21 | F-M07-021 | `k2b_auslastung` | Nutzen Sie Ihre Auslastungszahlen aktiv für Kapazitäts-/Einstellungsentscheidungen — oder werden sie erst betrachtet, wenn es brennt? | Ergänzung |
| 22 | F-M07-022 | `k1a_steuerungs_kpis` | Haben Sie neben rückblickenden Zahlen auch Frühindikatoren (Pipeline neuer Mandate, offene Angebote, Kündigungen) im Blick? | Ergänzung |

> **Auto-Dedup-Befund:** Nur F-M07-001 (Steuerungs-KPIs) und F-M07-008 (Reporting-Ritual) haben eine
> semantische Nähe zum M-04-Korpus (F-M04-003/012/015 Steuerungslogik/Ampel; F-M04-009/023
> Taktung/Steuerungsmeetings). Beide bewusst als **Variante** geführt: M-04 fragt aus der
> **Ergebnis-/Finanzsteuerung** heraus, M-07 aus dem **KPI-/Produktivitäts-System** (Realisierung,
> Auslastung, Rentabilität, Reporting-Ritual als Kennzahlen-Besprechung). Alle übrigen 20 sind
> Ergänzungen (kein exit_readiness-Recycling, DEC-234 gewahrt). M-07 ist das primäre Routing-Ziel
> des Blueprint-Unterthemas `a1_selbststeuerung` (M-BP §6) — die Zahlen-Souveränität landet hier.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M07-001 | KPI-Cockpit / Live-Dashboard (DATEV + Zeiterfassung → Cockpit) | 2 | K4c/K1a; F-M07-001, F-M07-015 |
| H-M07-002 | Realisierungsgrad-Auswertung (automatisch aus Zeit-/Abrechnungsdaten) | 2 | K2a; F-M07-003, F-M07-012 |
| H-M07-003 | Auslastungs-/Kapazitäts-Monitor je Mitarbeiter | 2 | K2b; F-M07-004, F-M07-021 |
| H-M07-004 | WIP- / Offene-Leistungen-Tracker (Alterung) | 2 | K3c; F-M07-014 |
| H-M07-005 | Automatisiertes Report-Generieren + Kommentar | 2 | K4a; F-M07-007, F-M07-020 |
| H-M07-006 | Mandanten-/Leistungs-Rentabilitäts-Analyse | 3 | K3b; F-M07-006, F-M07-013 |
| H-M07-007 | KPI-Definitions-Katalog / Single Source (einheitliche Berechnung) | 3 | K1b/K6a; F-M07-002, F-M07-018 |
| H-M07-008 | Ziel-Ist-Abweichungs-Assistent (Alert + Maßnahmenvorschlag) | 3 | K5a/K5b; F-M07-009, F-M07-016 |
| H-M07-009 | Branchen-Benchmark-Einordnung | 3 | K5c; F-M07-017 |
| H-M07-010 | Frühindikator- / Pipeline-Radar (vorlaufende Steuerung) | 4 | K1a; F-M07-022 |
| H-M07-011 | Datenqualitäts- / KPI-Konsistenz-Check vor Reporting | 4 | K6a/K6b; F-M07-018, F-M07-019 |

## 6. Output-Contract (`metadata.output_contract`)

Aus den M-07-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. verbindliches KPI-Set festlegen, Zielwerte je Kennzahl setzen, Rentabilitäts-Cut bei Verlustmandaten).
- `standard` — welche Norm/Routine gilt (z. B. monatliches Steuerungs-Ritual, einheitliche KPI-Definitionen, Realisierungsgrad-Zielkorridor).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. KPI-Cockpit aufsetzen, Zeiterfassung schließen, Abweichungs-Alert aktivieren).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m07`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
