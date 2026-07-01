# M-02 Seed-Source — Organisationsstruktur & Rollen (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m02` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-02 ist die **strukturelle Standortbestimmung
> der Aufbauorganisation** — Struktur, Rollen/Zuständigkeiten, Inhaber-Nadelöhr (strukturell),
> Stellvertretung/Ausfall-Redundanz, Schnittstellen, Übergabefähigkeit der Struktur. Es ist
> **Selbst-Diagnose der Organisation**, keine Personal-/Rechtsberatung. Bewusst getrennt von der
> *personellen* Ebene (M-26), den *Entscheidungsprozessen* (M-03), der *Haltung* zum Loslassen
> (M-42) und der *Einarbeitung* (M-28). Alle Fragen sind offen; die KI-Hebel strukturieren/prüfen.
> Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Organisation / Rollen Steuerkanzlei (Führung & Struktur; StB-Begründung „Inhaberabhängigkeit,
> reale vs. formale Struktur"). Blueprint-Anker: **primär** `e2_stellvertretung_fristen`,
> sekundär `e1_prozesse_wissen`. Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein recyceltes
> exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m02` |
| `version` | `1.0` |
| `name` | M-02 – Organisationsstruktur & Rollen |
| Kategorie | Führung & Struktur (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m02` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 17 (9 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-01-, M-04-, M-06-, M-07-, M-26-,
M-27-, M-28-, M-35- und M-42-Seed (MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks
abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in
`question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M02-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (S1..S6 / Sxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `S` (M-28 belegt `O`) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-02 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell S1–S6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Struktur-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-02-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m02`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| S1 | Aufbauorganisation & Struktur | `s1a_struktur_aufbau` | Grundstruktur (Teams/Bereiche/Mandantengruppen/Standorte, Einzelkämpfer vs. Team) |
| | | `s1b_real_vs_formal` | Gelebte vs. formale Struktur (Organigramm vorhanden & aktuell vs. läuft anders) |
| | | `s1c_wachstums_tauglichkeit` | Trägt die Struktur Wachstum/mehr Mandate (skaliert vs. am Anschlag) |
| S2 | Rollen & Verantwortlichkeiten | `s2a_rollenklarheit` | Klare Rollen/Zuständigkeiten vs. „jeder macht alles" |
| | | `s2b_verantwortung_mandate` | Mandatsverantwortung/-zuordnung (fester Ansprechpartner) |
| | | `s2c_doppel_luecken` | Doppelzuständigkeiten & Zuständigkeitslücken |
| S3 | Inhaber-Rolle in der Struktur (strukturell) | `s3a_inhaber_nadeloehr` | Strukturelle Konzentration von Rollen/Zeichnung/Freigaben beim Inhaber (Grenze: als Haltung → M-42) |
| | | `s3b_zweite_ebene` | Zweite Führungs-/Verantwortungsebene strukturell (Grenze: pers. Pipeline → M-26 P6; Entsch.-Delegation → M-03) |
| | | `s3c_rollen_entkopplung` | Inhaber-Rollen strukturell aufteilbar/entkoppelbar |
| S4 | Stellvertretung & Ausfall-Redundanz (strukturell) | `s4a_vertretungsregelung` | Geregelte, eingearbeitete Vertretung je Schlüsselrolle (Grenze: §69 → M-35, Einarbeitung → M-28) |
| | | `s4b_kritische_rollen_redundanz` | Kritische Rollen einfach vs. doppelt besetzt strukturell (Grenze: pers. Zweitbesetzung → M-26) |
| | | `s4c_fristen_ausfall_prozess` | Fristen-/Posteingangs-/Zeichnungs-Prozess gegen Ausfall abgesichert |
| S5 | Zusammenarbeit & Schnittstellen | `s5a_schnittstellen_uebergaben` | Schnittstellen/Übergaben zwischen Bereichen/Rollen (FiBu→Abschluss/Lohn/Beratung) |
| | | `s5b_zusammenarbeit_reibung` | Reibung/Doppelarbeit an Schnittstellen (Grenze: Meetings → M-40, Wissensdok → M-39) |
| | | `s5c_mandanten_kontinuitaet` | Betreuungskontinuität über Rollen-/Personalwechsel |
| S6 | Übergabefähige Struktur & Struktur-Wandel | `s6a_uebergabefaehige_struktur` | Läuft die Struktur ohne den Inhaber (strukturelle Übergabefähigkeit) |
| | | `s6b_struktur_ki_wandel` | Passt die Struktur zu neuen KI-/Digital-Rollen (Grenze: Systemwahl → M-36, Personalbedarf → M-26) |
| | | `s6c_anpassung_weiterentwicklung` | Struktur bewusst weiterentwickelt vs. historisch gewachsen |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-01/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M02-001 | `s1a_struktur_aufbau` | Wie ist Ihre Kanzlei heute organisiert — eher als Einzelkämpfer mit Zuarbeit, in festen Teams/Bereichen (FiBu, Lohn, Abschluss, Beratung) oder nach Mandantengruppen — und über wie viele Standorte? | Ergänzung |
| 2 | F-M02-002 | `s1b_real_vs_formal` | Gibt es ein Organigramm, das die tatsächliche Struktur abbildet — oder weicht die gelebte Realität (wer wirklich was macht und wem zuarbeitet) deutlich von dem ab, was auf dem Papier stünde? | Ergänzung |
| 3 | F-M02-003 | `s2a_rollenklarheit` | Sind die Rollen und Zuständigkeiten in Ihrem Team klar — weiß jeder, wofür er verantwortlich ist — oder macht faktisch „jeder alles" und vieles landet nach Verfügbarkeit? | Ergänzung |
| 4 | F-M02-004 | `s2b_verantwortung_mandate` | Ist geregelt, wer welche Mandate federführend verantwortet (fester Ansprechpartner, Vertretung) — oder hängt die Mandatsbetreuung eher unstrukturiert an wechselnden Personen? | Ergänzung |
| 5 | F-M02-005 | `s3a_inhaber_nadeloehr` | Wie viele Fäden laufen strukturell bei Ihnen als Inhaber zusammen — Zeichnung, Freigaben, Schlüsselmandate, Entscheidungen — und bei wie vielem sind Sie faktisch die einzige Stelle, an der es vorbeimuss? | Ergänzung (Grenze: das *Wollen*/die Haltung dahinter → M-42; hier die strukturelle Rollenkonzentration) |
| 6 | F-M02-006 | `s3b_zweite_ebene` | Gibt es unterhalb von Ihnen strukturell eine zweite Ebene (Teamleitung, Bereichsverantwortliche), die eigene Rollen und Verantwortung trägt — oder ist die Struktur flach mit Ihnen an jeder Spitze? | Ergänzung (Grenze: personelle Nachfolge-/Führungspipeline → M-26 P6; Entscheidungs-Delegation als Prozess → M-03) |
| 7 | F-M02-007 | `s4a_vertretungsregelung` | Für welche Schlüsselrollen — Sie selbst eingeschlossen — gibt es eine geregelte, eingearbeitete Vertretung, die im Ausfall übernehmen könnte? | Variante von F-BP-012 (M-BP: Stellvertretung + Fristenprozess, primäres Zielmodul m02; Grenze: §69-Rechtsregelung → M-35, Einarbeitung der Vertretung → M-28, personelle Zweitbesetzung → M-26 F-M26-016) |
| 8 | F-M02-008 | `s4c_fristen_ausfall_prozess` | Wie ist Ihr Fristen- und Posteingangsprozess gegen einen plötzlichen Ausfall abgesichert — würde ein unerwarteter Ausfall (Ihrer oder einer Schlüsselrolle) Fristen und Zeichnung ins Wanken bringen? | Variante von F-BP-012 (Fristen-/Ausfall-Hälfte der e2-Frage; hier strukturell vertieft) |
| 9 | F-M02-009 | `s6a_uebergabefaehige_struktur` | Wenn Sie sich für längere Zeit ganz herausnähmen: Würde die Kanzlei strukturell weiterlaufen — Rollen, Verantwortung, Zeichnung greifen — oder käme vieles zum Stillstand, weil es an Ihnen hängt? | Ergänzung (Grenze: das persönliche Loslassen → M-42, die vertragliche/§69-Seite → M-35; hier die strukturelle Übergabefähigkeit) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M02-010 | `s1c_wachstums_tauglichkeit` | Trägt Ihre heutige Struktur Wachstum — könnten Sie 20–30 % mehr Mandate aufnehmen, ohne dass die Organisation reißt — oder ist die Struktur schon heute am Anschlag? | Ergänzung (Grenze: Personal-Kapazität/Auslastung → M-26; hier die *strukturelle* Skalierbarkeit) |
| 11 | F-M02-011 | `s2c_doppel_luecken` | Gibt es bei Ihnen Aufgaben, die zwischen Rollen durchfallen („macht keiner"), oder umgekehrt Doppelzuständigkeiten, bei denen sich zwei im Weg stehen — und wo passiert das am häufigsten? | Ergänzung |
| 12 | F-M02-012 | `s3c_rollen_entkopplung` | Welche der Aufgaben/Rollen, die heute an Ihnen hängen, ließen sich strukturell abkoppeln und einer anderen Rolle fest zuordnen — und was hält Sie strukturell davon ab? | Ergänzung (Grenze: die persönliche Delegations-*Bereitschaft* → M-42 U3; hier die strukturelle Entkopplung) |
| 13 | F-M02-013 | `s4b_kritische_rollen_redundanz` | Welche Ihrer kritischen Rollen ist heute faktisch nur einfach besetzt — sodass ihr Ausfall sofort ein Loch reißt — und für welche gibt es strukturell eine Rückfallebene? | Variante von F-M26-016 (M-26: personelle Zweitbesetzung/Kapazität; hier die *strukturelle* Rollenredundanz/Rückfallebene) |
| 14 | F-M02-014 | `s5a_schnittstellen_uebergaben` | Wie sauber sind die Übergaben und Schnittstellen zwischen Ihren Bereichen (FiBu → Abschluss, Lohn, Beratung) geregelt — oder gehen an diesen Übergabepunkten regelmäßig Dinge verloren oder werden doppelt gemacht? | Ergänzung (Grenze: die Prozess-/Wissensdokumentation dahinter → M-39; hier die strukturelle Schnittstelle) |
| 15 | F-M02-015 | `s5c_mandanten_kontinuitaet` | Bleibt für den Mandanten die Betreuung kontinuierlich, wenn intern eine Rolle oder Person wechselt — oder merkt der Mandant Brüche (neuer Ansprechpartner ohne Übergabe, verlorener Kontext)? | Ergänzung |
| 16 | F-M02-016 | `s6b_struktur_ki_wandel` | Passt Ihre Rollenstruktur noch zu einer Kanzlei, in der KI Routine übernimmt — braucht es neue Rollen (Datenqualität, Prüfung, KI-/Prozessverantwortung), und ist dafür strukturell Platz? | Ergänzung (Grenze: KI-Systemwahl/Tools → M-36, Personalbedarf-Effekt → M-26 F-M26-019; hier die strukturelle Rollen-Anpassung) |
| 17 | F-M02-017 | `s6c_anpassung_weiterentwicklung` | Ist Ihre Organisationsstruktur bewusst so gestaltet — oder eher über die Jahre historisch gewachsen — und wann haben Sie sie zuletzt aktiv überprüft und angepasst? | Ergänzung |

> **Auto-Dedup-Befund:** M-02 (Aufbauorganisation & Rollen) ist gegenüber dem Korpus
> weitgehend frisch — **15 Ergänzungen, 2 Varianten**. Beide Varianten liegen auf der
> Stellvertretungs-/Ausfall-Achse, deren *primäres* Zielmodul m02 ist: **F-M02-007/008 ↔ F-BP-012**
> (M-BP-e2 diagnostiziert Stellvertretung + Fristenprozess in einer Frage; M-02 vertieft die
> *strukturelle Vertretungsregelung* bzw. den *Fristen-/Ausfall-Prozess*), und **F-M02-013 ↔ F-M26-016**
> (M-26 hält die *personelle* Zweitbesetzung/Kapazität; M-02 die *strukturelle* Rollenredundanz/
> Rückfallebene). Grenzen sauber gezogen: **M-03** (Entscheidungs-*Prozesse*/Governance — M-02 =
> Rollen/Struktur), **M-26** (Personal-*struktur*/Kapazität/Pipeline — M-02 = Aufbauorganisation),
> **M-28** (Einarbeitung — dorthin defert M-28 F-M28-003 die Rollen-Ownership zurück auf M-02),
> **M-42** (Inhaberabhängigkeit als *Haltung* — M-02 = strukturelles Nadelöhr), **M-39** (Prozess-/
> Wissens-*Dokumentation*, e1 primär m39 — M-02 = strukturelle Schnittstelle), **M-35** (§69
> rechtlich), **M-36** (KI-*Systemwahl*), **M-40** (Meetingstruktur — nicht im Cut). **Bewusst
> gedeckelt** (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt):
> `s5b_zusammenarbeit_reibung` ist im Themenbaum angelegt, aber in v1.0 ohne eigene Frage (die
> Reibung liegt implizit in F-M02-014) — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M02-001 | Rollen-/Zuständigkeits-Matrix (wer verantwortet was, Mandatszuordnung + Vertretung — Lücken/Doppelungen sichtbar) | 2 | S2; F-M02-003, F-M02-004, F-M02-011 |
| H-M02-002 | Ist-/Soll-Organigramm-Generator (gelebte vs. formale Struktur gegenüberstellen) | 2 | S1; F-M02-001, F-M02-002 |
| H-M02-003 | Inhaber-Nadelöhr-Analyse (welche Rollen/Fäden sich strukturell beim Inhaber konzentrieren, Entkopplungs-Kandidaten) | 3 | S3; F-M02-005, F-M02-012 |
| H-M02-004 | Stellvertretungs-/Ausfall-Redundanz-Check (je Schlüsselrolle: Vertretung vorhanden? Rückfallebene? Fristen-Absicherung) | 2 | S4; F-M02-007, F-M02-008, F-M02-013 |
| H-M02-005 | Schnittstellen-/Übergabe-Landkarte (Übergabepunkte zwischen Bereichen, Reibungs-/Verlust-Stellen) | 2 | S5; F-M02-014, F-M02-015 |
| H-M02-006 | Wachstums-Struktur-Stresstest (trägt die Struktur X % mehr Mandate — wo reißt sie zuerst) | 3 | S1c; F-M02-010 |
| H-M02-007 | Übergabefähigkeits-Struktur-Radar (läuft die Kanzlei strukturell ohne den Inhaber — Gesamtbild über alle Rollen) | 4 | S1–S6; F-M02-005, F-M02-009 |
| H-M02-008 | Zukunfts-Rollen-Designer (neue KI-/Digital-Rollen in die Struktur einplanen — Datenqualität, Prüfung, Prozessverantwortung) | 3 | S6b; F-M02-016 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-02-Output):** strukturelle Selbst-Diagnose der Organisation,
> keine Personal-/Rechtsberatung. Die Ausgabe strukturiert die eigenen Angaben und macht
> Struktur-/Rollen-/Ausfall-Lücken sichtbar.

Aus den M-02-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Rollen/Zuständigkeiten klar zuschneiden, eine
  zweite Führungsebene einziehen, Vertretung je Schlüsselrolle festlegen, Inhaber-Rollen gezielt
  entkoppeln, die Struktur an KI-/Wachstums-Realität anpassen).
- `standard` — welche Norm/Routine gilt (z. B. aktuelles Organigramm mit klaren Rollen, definierte
  Vertretung + Fristen-Ausfall-Prozess je Schlüsselrolle, Zweitbesetzung kritischer Rollen,
  saubere Schnittstellen-/Übergaberegeln, regelmäßiger Struktur-Review).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Rollen-/Zuständigkeits-Matrix
  aufsetzen, Vertretungsregelung + Fristen-Prozess dokumentieren, eine Inhaber-Aufgabe fest an
  eine Rolle übergeben, Schnittstellen-Übergaben festlegen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m02`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
