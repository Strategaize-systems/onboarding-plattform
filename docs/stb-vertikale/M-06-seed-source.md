# M-06 Seed-Source — Liquiditätsplanung & Zahlungsströme (SLC-170b, Welle 3)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m06` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE-Schnitt Founder-bestätigt);
> Domänen-Struktur Liquiditätssteuerung Steuerkanzlei. Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-04-seed-source.md`. Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **24 Fragen (11 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m06` |
| `version` | `1.0` |
| `name` | M-06 – Liquiditätsplanung & Zahlungsströme |
| Kategorie | Finanzen & Controlling (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m06` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 24 (11 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`- und M-04-Seed (MIG-029 / MIG-125).
Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace)
landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M06-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (L1..L6 / Lxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-06 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell L1–L6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-06-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später, wie M-04).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m06`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| L1 | Liquiditätsstatus & Reserve | `l1a_cash_sichtbarkeit` | Cash-Sichtbarkeit (Verfügbarkeit jederzeit bekannt) |
| | | `l1b_reserve_runway` | Reserve / Runway (Monate Fixkostendeckung) |
| | | `l1c_cash_vs_gewinn` | Cash ≠ Gewinn (Ergebnis- vs. Liquiditätsverständnis) |
| L2 | Liquiditätsplanung & Forecast | `l2a_planungsinstrument` | Planungsinstrument & Horizont (rollierende Vorschau) |
| | | `l2b_taktung_owner` | Taktung & Owner (wer pflegt, wie oft) |
| | | `l2c_soll_ist` | Soll-Ist-Abgleich der Vorschau |
| L3 | Forderungen & Honorareinzug (Inflows) | `l3a_rechnungstaktung` | Rechnungstaktung & Leistungs-Verzug (WIP→Rechnung) |
| | | `l3b_vorschuss_abschlag` | Vorschüsse / Abschläge / Dauermandat |
| | | `l3c_mahnwesen_dso` | Mahnwesen & Zahlungsverhalten (DSO) |
| L4 | Verbindlichkeiten & Auszahlungen (Outflows) | `l4a_personal_fixkosten` | Personal & Fixkosten (größter Block) |
| | | `l4b_eigene_steuern` | Eigene Steuern & Vorauszahlungen |
| | | `l4c_auszahlungs_timing` | Auszahlungs-Timing / -Steuerung |
| L5 | Saisonalität & Schwankungen | `l5a_saison_muster` | Saison-Muster (Abschluss-/Erklärungssaison, Sommerloch) |
| | | `l5b_planung_schwankung` | Planung / Rücklage gegen Schwankung |
| L6 | Puffer, Finanzierung & Stresstest | `l6a_finanzierungslinie` | Kontokorrent / Finanzierungslinie |
| | | `l6b_inhaber_entnahmen` | Inhaber-Entnahmen vs. Kanzlei-Liquidität |
| | | `l6c_stresstest` | Stress-Szenario (Großmandat-Ausfall / Zahlungsausfall) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 11 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M06-001 | `l1a_cash_sichtbarkeit` | Wissen Sie zu jedem Zeitpunkt, wie viel Geld Ihrer Kanzlei heute frei verfügbar ist — und wie kommen Sie an diese Zahl (Blick aufs Konto, Tabelle, Tool)? | Ergänzung |
| 2 | F-M06-002 | `l1b_reserve_runway` | Wie viele Monate könnte Ihre Kanzlei ihre Fixkosten (v. a. Gehälter) aus vorhandenen Reserven decken, wenn drei Monate lang kaum Honorar reinkäme? | Ergänzung |
| 3 | F-M06-003 | `l1c_cash_vs_gewinn` | Hatten Sie schon Monate mit gutem Ergebnis, in denen das Geld auf dem Konto trotzdem knapp war — und wissen Sie, woran das lag (offene Honorare, Steuern, Entnahmen)? | Variante von F-M04-016/017 (Cashflow-Brücke → hier: reine Zahlungsfähigkeit/Timing) |
| 4 | F-M06-004 | `l2a_planungsinstrument` | Führen Sie eine vorausschauende Liquiditätsplanung (erwartete Ein-/Auszahlungen über die nächsten Wochen/Monate) — oder steuern Sie die Kanzlei-Liquidität aus dem aktuellen Kontostand? | Variante von F-M04-011/019 (Forecast → hier: Liquiditäts-, nicht Ergebnis-Vorschau) |
| 5 | F-M06-005 | `l2b_taktung_owner` | Wer in Ihrer Kanzlei pflegt die Liquiditätsvorschau, in welchem Rhythmus wird sie aktualisiert — und was passiert mit ihr, wenn diese Person ausfällt? | Ergänzung |
| 6 | F-M06-006 | `l3a_rechnungstaktung` | Wie viel Zeit vergeht bei Ihnen typischerweise zwischen erbrachter Leistung und gestellter Rechnung — und bei welchen Mandaten/Leistungen bleibt die Abrechnung regelmäßig liegen? | Ergänzung |
| 7 | F-M06-007 | `l3b_vorschuss_abschlag` | Bei welchem Anteil Ihrer Mandate arbeiten Sie mit Vorschüssen oder monatlichen Abschlägen (Dauermandat) statt mit nachträglicher Einzelabrechnung — und wie planbar macht das Ihren Zahlungseingang? | Ergänzung |
| 8 | F-M06-008 | `l4a_personal_fixkosten` | Wie hoch ist Ihr monatlicher Fixkostenblock (Gehälter, Miete, Software/DATEV) im Verhältnis zum durchschnittlichen Monats-Zahlungseingang — und wie eng wird es, wenn ein großer Eingang später kommt? | Ergänzung |
| 9 | F-M06-009 | `l4b_eigene_steuern` | Legen Sie für eigene Steuervoraus- und -nachzahlungen der Kanzlei gezielt zurück — oder überraschen Sie diese Zahlungen liquiditätsmäßig regelmäßig? | Ergänzung |
| 10 | F-M06-010 | `l6a_finanzierungslinie` | Haben Sie eine Kontokorrent-/Kreditlinie als Puffer — und wie oft haben Sie sie in den letzten 12 Monaten tatsächlich in Anspruch genommen? | Ergänzung |
| 11 | F-M06-011 | `l6b_inhaber_entnahmen` | Nach welcher Logik entnehmen Sie Geld aus der Kanzlei (fester Betrag, nach Bedarf, nach verfügbarem Cash) — und richtet sich die Entnahme nach der Liquiditätslage oder unabhängig davon? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 12 | F-M06-012 | `l2c_soll_ist` | Vergleichen Sie regelmäßig geplante mit tatsächlich eingetretener Liquidität — und was tun Sie, wenn die Vorschau danebenlag? | Ergänzung |
| 13 | F-M06-013 | `l3c_mahnwesen_dso` | Wie läuft Ihr Mahnwesen (ab wann, wie automatisiert) — und welche Mandanten sind chronische Spätzahler? | Ergänzung |
| 14 | F-M06-014 | `l3c_mahnwesen_dso` | Wie viele Tage vergehen im Schnitt zwischen Rechnung und Zahlungseingang (DSO) — und kennen Sie diese Zahl überhaupt? | Ergänzung |
| 15 | F-M06-015 | `l4c_auszahlungs_timing` | Steuern Sie bewusst, wann Sie größere Rechnungen/Investitionen bezahlen (Timing an Zahlungseingänge koppeln) — oder wird bezahlt, sobald die Rechnung kommt? | Ergänzung |
| 16 | F-M06-016 | `l5a_saison_muster` | Welche Saison-Muster hat Ihr Zahlungseingang übers Jahr (Abschluss-/Erklärungs-Peaks, ruhige Monate) — und wo wird es regelmäßig eng? | Ergänzung |
| 17 | F-M06-017 | `l5a_saison_muster` | Planen Sie kalkulierbare Sonder-Auszahlungen (Urlaubs-/Weihnachtsgeld, Boni, Sommer-Umsatzdelle) vorausschauend in die Liquidität ein? | Ergänzung |
| 18 | F-M06-018 | `l5b_planung_schwankung` | Bilden Sie in umsatzstarken Monaten gezielt Rücklagen für die schwachen — oder gleicht sich das eher unstrukturiert aus? | Ergänzung |
| 19 | F-M06-019 | `l6c_stresstest` | Was würde mit Ihrer Liquidität passieren, wenn Ihr größtes Mandat morgen kündigt oder drei Monate nicht zahlt — haben Sie das je durchgerechnet? | Ergänzung (scharfe Aha-Frage) |
| 20 | F-M06-020 | `l6c_stresstest` | Ab welcher Reservegrenze würden Sie gegensteuern — und welche Hebel hätten Sie konkret (Entnahme stoppen, Linie ziehen, Kosten senken)? | Ergänzung |
| 21 | F-M06-021 | `l1a_cash_sichtbarkeit` | Sind Bankkonto/Zahlungsverkehr und Kanzlei-Software so verbunden, dass Sie den Liquiditätsstand ohne manuelles Zusammensuchen sehen? | Ergänzung |
| 22 | F-M06-022 | `l3b_vorschuss_abschlag` | Bei welchem Anteil Ihres Umsatzes ist der Zahlungseingang planbar wiederkehrend (Abschlag/Lastschrift) vs. unregelmäßig? | Ergänzung |
| 23 | F-M06-023 | `l4a_personal_fixkosten` | Wie stark schwankt Ihr Personalkosten-Auszahlungsblock (Überstunden, Aushilfen, Saisonkräfte) — und ist diese Schwankung in Ihrer Vorschau abgebildet? | Ergänzung |
| 24 | F-M06-024 | `l6b_inhaber_entnahmen` | Trennen Sie Kanzlei-Liquidität und private Liquidität sauber — oder fließt das faktisch ineinander? | Ergänzung |

> **Auto-Dedup-Befund:** Nur F-M06-003 (Cash≠Gewinn) und F-M06-004 (Vorschau) haben eine
> semantische Nähe zum M-04-Korpus (F-M04-016/017 Cashflow-Brücke Ergebnis→Cash; F-M04-011/019
> Planung & Forecast). Beide bewusst als **Variante** geführt: M-04 fragt aus der **Ergebnis**-
> Steuerung heraus (wie entsteht Cash aus dem Ergebnis, Ergebnis-Forecast), M-06 fragt aus der
> **Zahlungsfähigkeit** heraus (bin ich jederzeit zahlungsfähig, Ein-/Auszahlungs-Timing). Alle
> übrigen 22 sind Ergänzungen (kein exit_readiness-Recycling, DEC-234 gewahrt). Der Blueprint
> (M-BP) routet `a1_selbststeuerung` sekundär auf `m06` — die Verständnis-/Steuerungs-Brücke dort
> bleibt Blueprint-Diagnose, hier ist der operative Liquiditäts-Vertiefungspfad.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M06-001 | Automatische Liquiditäts-Ist-Sicht (Bank-Feed → Dashboard) | 2 | L1a; F-M06-001, F-M06-021 |
| H-M06-002 | Rollierende Liquiditätsvorschau (halbautomatisch aus Wiederkehr + Fixkosten) | 2 | L2a; F-M06-004, F-M06-005 |
| H-M06-003 | Rechnungs-Trigger bei Leistungsabschluss (WIP→Rechnung-Erinnerung) | 2 | L3a; F-M06-006 |
| H-M06-004 | Offene-Posten- & Mahn-Automatik | 2 | L3c; F-M06-013 |
| H-M06-005 | Steuer- & Fixkosten-Rücklagen-Rechner (automatisch zurücklegen) | 2 | L4b; F-M06-009 |
| H-M06-006 | DSO- / Zahlungsverhalten-Analyse je Mandant | 3 | L3c; F-M06-014, F-M06-022 |
| H-M06-007 | Auszahlungs-Timing-Assistent (Fälligkeiten an Cash koppeln) | 3 | L4c; F-M06-015 |
| H-M06-008 | Saison-Liquiditäts-Prognose (Jahresmuster lernen) | 3 | L5; F-M06-016, F-M06-018 |
| H-M06-009 | Liquiditäts-Stresstest / Szenario-Simulation (Mandatsausfall) | 3 | L6c; F-M06-019, F-M06-020 |
| H-M06-010 | Frühwarnung Liquiditätsengpass (Schwellenwert-/Anomalie-Alert) | 4 | L1b/L6; F-M06-002, F-M06-020 |
| H-M06-011 | Cash-Impact-Vorschau bei Entscheidungen (Einstellung/Investition/Entnahme → Liquiditätswirkung) | 4 | L4a/L6b; F-M06-011, F-M06-023 |

## 6. Output-Contract (`metadata.output_contract`)

Aus den M-06-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Kontokorrentlinie einrichten, Abschlagsmodell einführen, feste Entnahme-Regel).
- `standard` — welche Norm/Routine gilt (z. B. rollierende 13-Wochen-Liquiditätsvorschau, monatlicher Soll-Ist, Rücklagenquote für eigene Steuern).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Bank-Feed anbinden, Mahnlauf-Automatik aktivieren, Saison-Rücklage terminieren).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m06`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
