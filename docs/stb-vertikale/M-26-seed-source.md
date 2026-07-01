# M-26 Seed-Source — Personalstruktur & strategischer Personalbedarf (SLC-170b, Welle 4)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m26` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE-Schnitt + 83-%-Aufhänger
> Founder-bestätigt); Domänen-Struktur Personalstruktur/-bedarf Steuerkanzlei (HR & Personal).
> Aufhänger P3 = das branchentypische **83-%-Problem** (Personalmangel als Top-Engpass der
> Steuerberatung — als Pain-Rahmen übernommen, ohne feste Studien-Zitation, `nicht raten`).
> Tiefen-/Format-Maßstab + Auto-Dedup-Korpus: `M-04-seed-source.md`, `M-06-seed-source.md`,
> `M-BP-seed-source.md`. Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **24 Fragen (11 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m26` |
| `version` | `1.0` |
| `name` | M-26 – Personalstruktur & strategischer Personalbedarf |
| Kategorie | HR & Personal (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m26` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 24 (11 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04- und M-06-Seed
(MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte
„Ebene" (Kern/Workspace) landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M26-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (P1..P6 / Pxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-26 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell P1–P6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-26-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später, wie M-04/M-06).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m26`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| P1 | Ist-Personalstruktur & Rollen | `p1a_team_aufstellung` | Team-Aufstellung (Köpfe/FTE, Voll-/Teilzeit, Standorte) |
| | | `p1b_qualifikationsebenen` | Qualifikationsebenen (StB/vBP · Steuerfachwirt/Bilanzbuchhalter · Fachangestellte · Azubi · Backoffice) |
| | | `p1c_berufstraeger_quote` | Berufsträger-/Zeichnungs-Quote (wer darf zeichnen/verantworten) |
| P2 | Altersstruktur & Bindung | `p2a_altersstruktur_abgaenge` | Altersverteilung & anstehende Abgänge (5-Jahres-Blick) |
| | | `p2b_leistungstraeger_bindung` | Bindung der Leistungsträger / strukturelle Fluktuation |
| P3 | Kapazität & Auslastung (operatives 83-%-Symptom) | `p3a_auslastung_ablehnung` | Auslastungsgrenze & Mandatsablehnung/-abgabe wegen Personal |
| | | `p3b_produktive_quote` | Produktive vs. nicht-produktive Zeit / Mandate pro Kopf |
| | | `p3c_schluesselperson_klumpen` | Schlüsselperson-/Klumpenrisiko (Bus-Faktor auf Struktur-Ebene) |
| P4 | Kompetenz-/Skill-Mix & Engpässe | `p4a_kompetenzluecken` | Fehlende Kompetenzen (Beratung, Lohn, Internationales, Digital/KI) |
| | | `p4b_qualifizierungspfad` | Qualifizierungs-/Aufstiegspfad (Fachangestellte → Berufsträger) |
| P5 | Strategischer Personalbedarf & Kapazitätsplanung | `p5a_bedarfsplanung` | Vorausschauende Personalbedarfsplanung (vorhanden ja/nein, Horizont) |
| | | `p5b_ki_wandel_bedarf` | KI-/Automatisierungs-Effekt auf künftigen Bedarf (welche Rollen schrumpfen/wachsen) |
| | | `p5c_wachstum_szenario` | Bedarf unter Wachstum/Mandatsentwicklung |
| P6 | Interne (Berufsträger-)Nachfolge & Führungspipeline | `p6a_berufstraeger_nachfolge` | Personelle Berufsträger-Nachfolge (wer kann zeichnen, wenn Inhaber geht) |
| | | `p6b_fuehrungs_pipeline` | Führungs-/Teamleiter-Pipeline & Verantwortungsübergabe |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-BP-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 11 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M26-001 | `p1a_team_aufstellung` | Wie ist Ihr Team heute aufgestellt — wie viele Köpfe bzw. Vollzeitäquivalente, in welchem Voll-/Teilzeit-Verhältnis und über wie viele Standorte verteilt? | Ergänzung |
| 2 | F-M26-002 | `p1b_qualifikationsebenen` | Wie verteilt sich Ihr Team über die Qualifikationsebenen (Berufsträger StB/vBP · Steuerfachwirt/Bilanzbuchhalter · Steuerfachangestellte · Azubi · Backoffice) — und wo ist diese Struktur zu kopf- oder zu breitlastig? | Ergänzung |
| 3 | F-M26-003 | `p1c_berufstraeger_quote` | Wie viele Ihrer Leute dürfen eigenverantwortlich zeichnen/verantworten (Berufsträger) — und was passiert mit der Zeichnungsfähigkeit Ihrer Kanzlei, wenn Sie selbst länger ausfallen? | Ergänzung (Grenze: rechtliche Vertreterbestellung §69 StBerG → M-35) |
| 4 | F-M26-004 | `p2a_altersstruktur_abgaenge` | Wie ist die Altersverteilung in Ihrem Team — und wie viele Ihrer Leute (Sie eingeschlossen) scheiden in den nächsten 5 Jahren voraussichtlich aus (Ruhestand, absehbarer Wechsel)? | Ergänzung |
| 5 | F-M26-005 | `p3a_auslastung_ablehnung` | Mussten Sie in den letzten 12 Monaten Mandate ablehnen, abgeben oder auf Warteschleife setzen, weil Ihnen die Leute fehlten — und in welchem Umfang? | Variante von F-BP-005 (M-BP: Diagnose Stellen-Gap → Mandatsablehnung; hier operative Vertiefung Umfang/Muster. Recruiting-Teil „Stellen gesucht/besetzt" bleibt M-27) |
| 6 | F-M26-006 | `p3a_auslastung_ablehnung` | Wie voll ist Ihr Team ausgelastet — sind Überstunden bei Ihren Leuten (und bei Ihnen) der Normalzustand oder die Ausnahme, und wie lange geht das schon so? | Ergänzung |
| 7 | F-M26-007 | `p3c_schluesselperson_klumpen` | An welchen einzelnen Personen hängen bei Ihnen ganze Mandatsblöcke oder kritisches Know-how so stark, dass ein Ausfall dieser Person ein echtes Problem wäre — und wer ist das konkret? | Variante von F-BP-006 (M-BP/M-28: Wissensverlust + Einarbeitungszeit; hier strukturelles Klumpen-/Schlüsselperson-Risiko auf Rollen-/Kapazitätsebene. Einarbeitung bleibt M-28) |
| 8 | F-M26-008 | `p5a_bedarfsplanung` | Planen Sie Ihren Personalbedarf vorausschauend (wie viele/welche Leute brauche ich in 1–3 Jahren) — oder suchen Sie erst, wenn jemand kündigt oder die Arbeit überläuft? | Ergänzung |
| 9 | F-M26-009 | `p6a_berufstraeger_nachfolge` | Gibt es in Ihrem Team heute jemanden, der perspektivisch die fachliche Verantwortung / Zeichnung übernehmen könnte, wenn Sie kürzertreten oder übergeben — und wie weit ist diese Person? | Ergänzung (Grenze: gesellschaftsrechtliche Nachfolge → M-35; persönliches Loslassen → M-42) |
| 10 | F-M26-010 | `p4a_kompetenzluecken` | Welche Kompetenz fehlt Ihnen im Team heute am meisten (z. B. Lohn, Beratung, Internationales, Digital/KI) — und woran merken Sie diese Lücke im Alltag? | Ergänzung |
| 11 | F-M26-011 | `p2b_leistungstraeger_bindung` | Warum bleiben Ihre Leistungsträger bei Ihnen — und wie groß wäre die Lücke, wenn Ihre zwei, drei wichtigsten Fachkräfte abgeworben würden? | Ergänzung (Grenze: generische Arbeitgeberattraktivität/Employer Branding → M-27; hier strukturelle Schlüsselkraft-Bindung) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 12 | F-M26-012 | `p1a_team_aufstellung` | Nutzen Sie Teilzeit-/Flex-Modelle bewusst als Kapazitätshebel (z. B. Rückkehrende aus Elternzeit, Stundenaufstockung) — oder ist Ihre Kapazität faktisch an Vollzeitstellen gebunden? | Ergänzung |
| 13 | F-M26-013 | `p2a_altersstruktur_abgaenge` | Für die in den nächsten Jahren absehbaren Abgänge: Ist jeweils Ersatz in Ausbildung, in Sicht oder eingeplant — oder träfe Sie der Abgang unvorbereitet? | Ergänzung |
| 14 | F-M26-014 | `p2b_leistungstraeger_bindung` | Wie hoch ist Ihre Fluktuation, und wie lange bleiben Leute im Schnitt bei Ihnen — kennen Sie diese Zahlen, und wie erklären Sie sich Abgänge der letzten Jahre? | Ergänzung |
| 15 | F-M26-015 | `p3b_produktive_quote` | Welcher Anteil der Team-Zeit geht in produktive, abrechenbare Mandatsarbeit vs. in Verwaltung/Rückfragen/Nacharbeit — und wie viele Mandate trägt ein Berufsträger bei Ihnen? | Variante von F-BP-017 (M-BP: Personalkostenanteil + Beratungszeit-Anteil; hier operative Kapazitäts-/Produktivitätsverteilung) |
| 16 | F-M26-016 | `p3c_schluesselperson_klumpen` | Für welche Ihrer kritischen Rollen gibt es eine zweite Person, die einspringen könnte — und welche Rolle ist heute faktisch nur einfach besetzt? | Variante von F-BP-012 (M-BP: Stellvertretung + Fristenprozess → M-02/M-28; hier strukturelle Doppelbesetzung/Redundanz auf Personalebene) |
| 17 | F-M26-017 | `p4a_kompetenzluecken` | Welche Kompetenzen wird Ihre Kanzlei künftig stärker brauchen (z. B. betriebswirtschaftliche Beratung, Digital-/KI-Kompetenz) — und wie weit ist Ihr heutiges Team davon entfernt? | Ergänzung |
| 18 | F-M26-018 | `p4b_qualifizierungspfad` | Fördern Sie systematisch den Aufstieg (Fachangestellte → Fachwirt/Bilanzbuchhalter → Berufsträger) — oder bleibt Weiterentwicklung dem Zufall / der Eigeninitiative überlassen? | Ergänzung |
| 19 | F-M26-019 | `p5b_ki_wandel_bedarf` | Wie verändert Automatisierung/KI Ihren Personalbedarf — welche Rollen/Tätigkeiten schrumpfen (Routine-FiBu), welche wachsen (Prüfung, Beratung, Datenqualität)? | Ergänzung (Grenze: KI-Tooling/Systemwahl → M-36; hier nur der Bedarfs-Effekt) |
| 20 | F-M26-020 | `p5c_wachstum_szenario` | Wenn Sie in den nächsten 2–3 Jahren wachsen wollen (oder Mandate durch Abgänge nachbesetzen müssen) — wie viele und welche Einstellungen bräuchte das konkret, und ist der Markt dafür überhaupt da? | Ergänzung |
| 21 | F-M26-021 | `p1c_berufstraeger_quote` | Wenn Sie selbst 6 Monate ungeplant ausfielen: Bliebe Ihre Kanzlei zeichnungs- und handlungsfähig — oder hängt die Berufsträger-Verantwortung faktisch allein an Ihnen? | Ergänzung (scharfe Aha-Frage; rechtliche Vertreterbestellung §69 StBerG → M-35) |
| 22 | F-M26-022 | `p6a_berufstraeger_nachfolge` | Falls es einen internen Nachfolge-Kandidaten gibt: Was fehlt ihm heute noch (fachliche Reife, Führung, Berufsexamen, Beteiligung) — und in welchem Zeithorizont wäre er übernahmefähig? | Ergänzung |
| 23 | F-M26-023 | `p6b_fuehrungs_pipeline` | Gibt es unterhalb von Ihnen eine Führungs-/Teamleiter-Ebene, die Verantwortung trägt — oder laufen alle wesentlichen Entscheidungen weiterhin über Sie? | Ergänzung (Grenze: Governance/Entscheidungsprozesse → M-03) |
| 24 | F-M26-024 | `p3a_auslastung_ablehnung` | Was würde mit Ihrer Auslastung und Ihren Mandaten passieren, wenn in den nächsten 12 Monaten zwei Leistungsträger gleichzeitig ausfielen — haben Sie das je durchgerechnet? | Ergänzung (scharfe Aha-Frage) |

> **Auto-Dedup-Befund:** HR-Personalstruktur ist gegenüber dem bestehenden Korpus (Finanzmodule
> M-04/M-06) frisches Terrain — 20 der 24 Fragen sind **Ergänzungen**. Die 4 **Varianten** liegen
> erwartungsgemäß im **Blueprint-Personalblock B** (M-BP), der genau auf `m26` routet
> (`b1_personalengpass` primär m26): F-M26-005 ↔ F-BP-005 (Diagnose-Mandatsablehnung → operative
> Vertiefung; Recruiting-Teil bleibt M-27), F-M26-007 ↔ F-BP-006 (Wissensverlust → strukturelles
> Klumpen-Risiko; Einarbeitung bleibt M-28), F-M26-015 ↔ F-BP-017 (Kostenanteil/Beratungszeit →
> operative Produktivität), F-M26-016 ↔ F-BP-012 (Stellvertretung/Fristen → strukturelle
> Doppelbesetzung; Fristenprozess bleibt M-02/M-28). Alle als bewusste Varianten geführt: der
> Blueprint **diagnostiziert** den Personalengpass über die ganze Kanzlei, M-26 **vertieft** ihn
> operativ (Struktur, Bedarf, interne Nachfolge). HR-Trio sauber geschnitten — **M-27** (Recruiting/
> Employer Branding: *wie* gewinne ich Leute) und **M-28** (Onboarding/Einarbeitung: *wie* werden
> Neue produktiv) bewusst ausgespart (kein exit_readiness-Recycling, DEC-234 gewahrt).

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M26-001 | Personalstruktur-Übersicht (Köpfe/FTE je Qualifikationsebene, Voll-/Teilzeit, Standorte) | 1 | P1a/P1b; F-M26-001, F-M26-002 |
| H-M26-002 | Auslastungs-/Kapazitäts-Heatmap je Mitarbeiter/Team (Überlast früh sichtbar) | 2 | P3a; F-M26-006, F-M26-005 |
| H-M26-003 | Alters-/Abgangs-Zeitstrahl & Nachbesetzungs-Frühwarnung (wer geht wann, ist Ersatz in Sicht) | 2 | P2a; F-M26-004, F-M26-013 |
| H-M26-004 | Skill-/Kompetenz-Matrix (wer kann was, wo ist die Kanzlei nur einfach besetzt) | 2 | P4a/P3c; F-M26-010, F-M26-016 |
| H-M26-005 | Qualifizierungs-/Aufstiegspfad-Planer (individuelle Entwicklungspläne Fachangestellte → Berufsträger) | 2 | P4b; F-M26-018 |
| H-M26-006 | Mandats-/Wissens-Klumpen-Analyse (welche Mandate/welcher Umsatz hängen an einer Person) | 3 | P3c; F-M26-007, F-M26-016 |
| H-M26-007 | Nachfolge-/Führungspipeline-Tracker (interne Kandidaten, Reifegrad, was fehlt noch) | 3 | P6a/P6b; F-M26-009, F-M26-022, F-M26-023 |
| H-M26-008 | Strategische Personalbedarfs-Prognose (Bedarf aus Mandatsentwicklung + Abgängen + Auslastung) | 3 | P5a/P5c/P2a; F-M26-008, F-M26-020, F-M26-004 |
| H-M26-009 | Fluktuations-/Bindungs-Frühwarnung (Abwanderungsrisiko der Leistungsträger) | 4 | P2b; F-M26-011, F-M26-014 |
| H-M26-010 | KI-Wandel-Simulator Personalbedarf (welche Rollen verändert Automatisierung, welche Kapazität wird frei/fehlt) | 4 | P5b; F-M26-019 |
| H-M26-011 | Szenario-Personalplanung (Wachstum/Abgang/KI → benötigte Einstellungen & Timing, Cash-/Kapazitätswirkung) | 4 | P5c/P5a; F-M26-020, F-M26-024 |

## 6. Output-Contract (`metadata.output_contract`)

Aus den M-26-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Stelle schaffen/streichen, Berufsträger-Ausbildung eines Kandidaten fördern, Schlüsselperson-Klumpen entkoppeln, Qualifizierungsinvestition, interne Nachfolge aufbauen vs. extern zukaufen).
- `standard` — welche Norm/Routine gilt (z. B. jährliche Personalbedarfsplanung, aktuelle Skill-Matrix, Alters-/Abgangs-Zeitstrahl, Doppelbesetzung jeder kritischen Rolle, Entwicklungsplan je Leistungsträger).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Skill-Matrix aufsetzen, Kapazitäts-Dashboard einrichten, Entwicklungsgespräch mit Nachfolge-Kandidat terminieren, Zweitbesetzung der Engpass-Rolle starten).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m26`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
