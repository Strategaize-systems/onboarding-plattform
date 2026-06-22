# M-04 Seed-Source — Quell-Mapping (SLC-170 / MIG-125)

> **Zweck:** menschen-lesbares Quell-Mapping von der M-04-Modul-Spec auf die geseedete
> `template`-Row `stb_modul_m04` v1.0 (MIG-125). Hält die Provenienz (Frage-IDs, Ebene,
> Duplikat-Hinweise, KI-Hebel-Referenzen), die in der DB-Row nicht 1:1 abgelegt wird.
> **System-of-Record bleibt** die `template`-Tabelle. Stand 2026-06-22 (SLC-170, DEC-242).
>
> **IP-Quelle:** `M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx`
> (Dev-System strategy-docs, untracked — R-170-2). 26 Fragen / 13 KI-Hebel.
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m04` |
| `version` | `1.0` |
| `name` | M-04 – Grundlegende Finanzsteuerung (GuV/Bilanz/Cash) |
| Kategorie | Finanzen & Controlling (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m04` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 26 (10 Kern / 16 Workspace) |
| KI-Hebel | 13 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-Seed (MIG-029). Die zwei Stufen
werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace) landet
zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M04-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (Block D / Dx …) | `question.unterbereich` | verbatim |
| Fragetext | `question.text` | verbatim |
| Typ („offen") | — | M-04 hat ausschließlich offene Fragen; kein Score-Mapping (≠ partner_diagnostic). Kein DB-Feld nötig. |
| Hinweis/Kommentar (Duplikat-Refs) | — | nur hier dokumentiert (siehe §3) — Provenienz, nicht produktiv genutzt |
| Themenmodell 2.1–2.7 | `metadata.themenmodell[]` | 7 Bereiche mit Unterpunkten |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§4) |
| Output-Artefakte / DoD / Symptome / Abgrenzung | `metadata.*` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-04-Spec liefert diese nicht → alle auf `false` (Default). Sie sind exit-readiness-
spezifische Diagnose-Flags und für ein StB-Modul-Questionnaire nicht spezifiziert.

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` → stabil über Re-Applies (ON CONFLICT DO UPDATE ersetzt `blocks` als
Ganzes; gleiche IDs bleiben).

## 3. Fragebogen — Provenienz

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 10 Fragen)

| Pos | Frage-ID | Unterbereich | Provenienz-Hinweis |
|---|---|---|---|
| 1 | F-M04-001 | Block D / D1 Wirtschaftliche Orientierung | Duplikat von F-BP-045 (Quelle: M-BP) |
| 2 | F-M04-002 | Block D / D1 Wirtschaftliche Orientierung | Duplikat von F-BP-046 (Quelle: M-BP) |
| 3 | F-M04-005 | Block D / D1 Wirtschaftliche Orientierung | Duplikat von F-BP-047 (Quelle: M-BP) |
| 4 | F-M04-003 | Block D / D2 Steuerungslogik | Duplikat von F-BP-048 (Quelle: M-BP) |
| 5 | F-M04-004 | Block D / D2 Steuerungslogik | Duplikat von F-BP-049 (Quelle: M-BP) |
| 6 | F-M04-008 | Block D / D3 Rollen & Taktung | Ergänzung |
| 7 | F-M04-009 | Block D / D3 Rollen & Taktung | Ergänzung |
| 8 | F-M04-010 | Block D / D4 GuV–Bilanz–Cash | Ergänzung |
| 9 | F-M04-011 | Block D / D5 Planung & Forecast | Ergänzung |
| 10 | F-M04-012 | Block D / D5 Planung & Forecast | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 16 Fragen)

| Pos | Frage-ID | Unterbereich | Provenienz-Hinweis |
|---|---|---|---|
| 11 | F-M04-006 | Block D / D4 Transparenz & Verständnis | Duplikat von F-BP-052 (Quelle: M-BP) |
| 12 | F-M04-007 | Block D / D4 Transparenz & Verständnis | Duplikat von F-BP-053 (Quelle: M-BP) |
| 13 | F-M04-013 | Block D / D3 Rollen & Taktung | Ergänzung |
| 14 | F-M04-014 | Block D / D3 Rollen & Taktung | Ergänzung |
| 15 | F-M04-015 | Block D / D2 Steuerungslogik | Ergänzung |
| 16 | F-M04-016 | Block D / D4 GuV–Bilanz–Cash | Ergänzung |
| 17 | F-M04-017 | Block D / D4 GuV–Bilanz–Cash | Ergänzung |
| 18 | F-M04-018 | Block D / D4 GuV–Bilanz–Cash | Ergänzung |
| 19 | F-M04-019 | Block D / D5 Planung & Forecast | Ergänzung |
| 20 | F-M04-020 | Block D / D5 Planung & Forecast | Ergänzung |
| 21 | F-M04-021 | Block D / D6 Systeme & Daten | Ergänzung |
| 22 | F-M04-022 | Block D / D6 Systeme & Daten | Ergänzung |
| 23 | F-M04-023 | Block D / D3 Steuerungsmeetings | Ergänzung |
| 24 | F-M04-024 | Block D / D5 Frühindikatoren | Ergänzung |
| 25 | F-M04-025 | Block D / D7 Szenarien | Ergänzung |
| 26 | F-M04-026 | Block D / D6 Finance Literacy | Ergänzung |

> Die 7 Kern-Duplikate (F-M04-001..005/006/007 ↔ F-BP-045..049/052/053) sind bewusste
> Überschneidungen mit dem Blueprint-Block D (exit_readiness). Im StB-Modul-Kontext stehen
> sie eigenständig; die Verdichtung (SLC-174) liest sie aus den M-04-Antworten.

## 4. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M04-001 | Monatsreport-Autokommentar | 2 | 2.3/2.5; F-M04-009, F-M04-020 |
| H-M04-002 | KPI-Cockpit mit Ampellogik | 2 | 2.2; F-M04-003, F-M04-012, F-M04-015 |
| H-M04-003 | Closing-Workflow & Checkliste | 1 | 2.3; F-M04-009, F-M04-013 |
| H-M04-004 | Cashflow-Brücke Ergebnis→Cash | 2 | 2.4; F-M04-010, F-M04-016, F-M04-017 |
| H-M04-005 | Abweichungsanalyse-Assistent | 2 | 2.5; F-M04-020 |
| H-M04-006 | Datenqualitäts-Checks vor Reporting | 2 | 2.6; F-M04-014, F-M04-022 |
| H-M04-007 | Meeting-Protokoll & Maßnahmen-Tracking | 1 | 2.3/2.2; F-M04-012, F-M04-023 |
| H-M04-008 | Finance-Literacy Micro-Learning | 2 | 2.6; F-M04-026 |
| H-M04-009 | Rolling-Forecast-Agent | 3 | 2.5; F-M04-011, F-M04-019 |
| H-M04-010 | Treiberbasierte Szenario-Simulation | 3 | 2.7; F-M04-025 |
| H-M04-011 | Maßnahmen-Wirkungsnachweis | 4 | 2.2/2.5; F-M04-012, F-M04-020 |
| H-M04-012 | Single Source of Truth Finance+Operativ | 4 | 2.6; F-M04-021, F-M04-022 |
| H-M04-013 | Risiko-Frühwarnsystem (Anomalien) | 4 | 2.5/2.4; F-M04-024, F-M04-017 |

## 5. Output-Contract (`metadata.output_contract`)

Aus den M-04-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK
(MIG-124):

- `entscheidung` — was zu entscheiden ist
- `standard` — welche Norm/Routine gilt
- `implementierungsschritt` — konkreter nächster Schritt

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben.

## 6. Regenerierung

Die `.sql`-Datei (`sql/migrations/125_v10_stb_template_seed.sql`) ist das Artefakt und der
Source-of-Truth für den Seed. Sie wurde aus der Modul-Spec deterministisch erzeugt (valides
JSON via `json.dumps`, `uuid5`-IDs). Bei Inhalts-Updates: neue Version (`1.1`) oder neue
Migration, nicht 125 editieren (Immutable-Migration-Disziplin).
