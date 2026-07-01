# M-28 Seed-Source — Onboarding & Einarbeitung (SLC-170b, Welle 4)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m28` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE + Remote/Teilzeit-Onboarding
> Founder-bestätigt); Domänen-Struktur Onboarding/Einarbeitung Steuerkanzlei (HR & Personal,
> Wissensaufbau bei Fluktuation). Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-04/M-06/M-BP/M-26/M-27-seed-source.md`. Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **24 Fragen (11 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m28` |
| `version` | `1.0` |
| `name` | M-28 – Onboarding & Einarbeitung |
| Kategorie | HR & Personal (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m28` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 24 (11 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04-, M-06-, M-26- und M-27-Seed
(MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte
„Ebene" (Kern/Workspace) landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M28-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (O1..O6 / Oxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-28 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell O1–O6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-28-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später, wie M-04/M-06/M-26/M-27).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m28`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| O1 | Onboarding-Prozess & Struktur | `o1a_strukturierter_plan` | Strukturierter Onboarding-/Einarbeitungsplan (vorhanden, standardisiert) |
| | | `o1b_preboarding_erster_tag` | Preboarding & erster Tag/erste Woche (Ausstattung, Zugänge, Empfang) |
| | | `o1c_verantwortung_owner` | Verantwortung fürs Onboarding (HR/Teamleiter/Inhaber nebenbei) |
| O2 | Fachliche Einarbeitung & Time-to-Productivity | `o2a_einarbeitungszeit` | Zeit bis zur Eigenständigkeit |
| | | `o2b_fachliche_vermittlung` | Fachliche Einarbeitung (Mandate, DATEV/Tools, Prozesse, Fristen) |
| | | `o2c_meilensteine` | Meilensteine/Checkpoints in der Einarbeitung |
| O3 | Wissensvermittlung & -zugang | `o3a_wissenszugang` | Zugang zu Kanzlei-Know-how beim Start („wie machen wir das hier") |
| | | `o3b_wissenstransfer_abgang` | Wissenstransfer bei Ausscheiden/Übergabe (Wissensverlust vermeiden) |
| O4 | Betreuung & Integration | `o4a_mentoring_pate` | Mentoring/Patensystem/fester Ansprechpartner |
| | | `o4b_kulturelle_integration` | Kulturelle/soziale Integration ins Team |
| O5 | Probezeit-Steuerung & Frühbindung | `o5a_feedback_probezeit` | Feedback-/Probezeit-Gespräche, Frühwarnung Fehlbesetzung |
| | | `o5b_fruehe_bindung` | Frühe Bindung / Abbruch-Risiko in den ersten Monaten |
| O6 | Zielgruppen-Onboarding | `o6a_azubi_quereinsteiger` | Onboarding für Azubis / Quer-/Wiedereinsteiger (unterschiedliche Pfade) |
| | | `o6b_remote_teilzeit_onboarding` | Onboarding bei Remote/Teilzeit/digitalem Arbeiten |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-BP/M-26/M-27-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 11 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M28-001 | `o1a_strukturierter_plan` | Haben Sie einen strukturierten Onboarding-/Einarbeitungsplan, den jeder Neue durchläuft — oder läuft Einarbeitung bei Ihnen eher „learning by doing" und je nachdem, wer gerade Zeit hat? | Ergänzung |
| 2 | F-M28-002 | `o1b_preboarding_erster_tag` | Wie läuft bei Ihnen der erste Tag / die erste Woche eines Neuen ab — ist Empfang, Vorstellung und Ablauf vorbereitet, oder wird das improvisiert? | Ergänzung |
| 3 | F-M28-003 | `o1c_verantwortung_owner` | Wer ist bei Ihnen für die Einarbeitung eines Neuen verantwortlich (fester Owner, Teamleiter, der Inhaber nebenbei) — und ist klar, wer was übernimmt? | Ergänzung (Grenze: Rollen/Governance → M-02) |
| 4 | F-M28-004 | `o2a_einarbeitungszeit` | Wie lange dauert es typischerweise, bis eine neue Fachkraft bei Ihnen eigenständig Mandate bearbeiten kann — und woran machen Sie „eigenständig" fest? | Variante von F-BP-006 (M-BP: Wissensverlust + Zeit bis Eigenständigkeit; hier die Eigenständigkeits-Hälfte. Klumpen-Hälfte = M-26 F-M26-007, Wissensverlust-Hälfte = F-M28-008) |
| 5 | F-M28-005 | `o2b_fachliche_vermittlung` | Wie werden Neue fachlich eingearbeitet (Mandantenübergabe, DATEV/Tools, Ihre Prozesse und Fristen) — strukturiert, oder Zufall, wer gerade was zeigt? | Ergänzung |
| 6 | F-M28-006 | `o2c_meilensteine` | Gibt es in der Einarbeitung Meilensteine/Checkpoints, an denen Sie prüfen, wo der Neue steht — oder merkt man erst am Ergebnis, ob es funktioniert hat? | Ergänzung |
| 7 | F-M28-007 | `o3a_wissenszugang` | Wo findet ein Neuer an Tag 1 die Antwort auf „wie machen wir das hier" (Checklisten, Muster, Ansprechpartner) — oder muss er sich alles einzeln zusammenfragen? | Variante von F-BP-011 (M-BP e1: der Onboarding-Aspekt „Neuer an Tag 1". Prozess-Doku/Wissensplattform selbst bleibt M-39) |
| 8 | F-M28-008 | `o3b_wissenstransfer_abgang` | Wenn ein erfahrener Mitarbeiter Sie verlässt: Wie sichern Sie sein Wissen und übergeben seine Mandate geordnet — oder geht vieles mit ihm verloren? | Variante von F-BP-006 (Wissensverlust-Hälfte; Grenze: Wissensplattform/Dokumenttypen → M-39) |
| 9 | F-M28-009 | `o4a_mentoring_pate` | Bekommt ein Neuer bei Ihnen einen festen Ansprechpartner/Paten für die erste Zeit — oder muss er sich seine Hilfe selbst suchen? | Ergänzung |
| 10 | F-M28-010 | `o5a_feedback_probezeit` | Gibt es in der Probezeit feste Feedback-/Zwischengespräche — und würden Sie eine Fehlbesetzung früh genug merken, um zu reagieren? | Ergänzung (Grenze: laufende Personalentwicklung M-30, nicht im Cut) |
| 11 | F-M28-011 | `o5b_fruehe_bindung` | Was kostet Sie eine Fehlbesetzung, die erst nach der Probezeit auffällt — und ist Ihnen das schon passiert? | Ergänzung (scharfe Aha-Frage) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 12 | F-M28-012 | `o1a_strukturierter_plan` | Ist Ihr Einarbeitungsablauf so dokumentiert, dass er gleich gut funktioniert — egal, wer gerade einarbeitet — oder hängt die Qualität an der einarbeitenden Person? | Ergänzung |
| 13 | F-M28-013 | `o1b_preboarding_erster_tag` | Sind am ersten Tag alle Zugänge und die Ausstattung bereit (Arbeitsplatz, Technik, DATEV-Rechte, Logins) — oder verliert der Neue die erste Woche mit Warten? | Ergänzung |
| 14 | F-M28-014 | `o1c_verantwortung_owner` | Bekommen die Einarbeitenden bei Ihnen tatsächlich Zeit dafür eingeräumt — oder läuft Einarbeitung „nebenbei" zum vollen Tagesgeschäft? | Ergänzung |
| 15 | F-M28-015 | `o2b_fachliche_vermittlung` | Wie führen Sie Neue an Mandanten heran (begleitete Übergabe, Schatten-Mitlaufen, gemeinsame Termine) — oder geht es eher direkt ins kalte Wasser? | Ergänzung |
| 16 | F-M28-016 | `o2c_meilensteine` | Wie kontrollieren Sie die Qualität der ersten eigenständigen Arbeiten eines Neuen (Vier-Augen, Freigaben) — bis Sie ihm wirklich vertrauen? | Ergänzung |
| 17 | F-M28-017 | `o4b_kulturelle_integration` | Wie sorgen Sie dafür, dass ein Neuer sich sozial im Team ankommt und zugehörig fühlt (Vorstellung, Einbindung, informeller Kontakt)? | Ergänzung |
| 18 | F-M28-018 | `o5a_feedback_probezeit` | Treffen Sie die Übernahme-/Ende-Probezeit-Entscheidung bewusst und auf Basis konkreter Beobachtungen — oder läuft die Probezeit einfach durch? | Ergänzung |
| 19 | F-M28-019 | `o5b_fruehe_bindung` | Kommt es vor, dass Neue in den ersten 6–12 Monaten wieder gehen — und wissen Sie, woran das lag? | Ergänzung |
| 20 | F-M28-020 | `o6a_azubi_quereinsteiger` | Unterscheiden Sie das Onboarding nach Zielgruppe (Azubi vs. erfahrene Fachkraft vs. Quereinsteiger) — oder bekommen alle dasselbe? | Ergänzung (Grenze: Azubi-Übernahme/Bindung *während* der Ausbildung → M-27 R3b; hier die Einarbeitung) |
| 21 | F-M28-021 | `o6a_azubi_quereinsteiger` | Wie arbeiten Sie fachfremde Quereinsteiger oder Rückkehrer (z. B. aus Elternzeit) gezielt ein — und funktioniert das? | Ergänzung |
| 22 | F-M28-022 | `o6b_remote_teilzeit_onboarding` | Wie stellen Sie Einarbeitung und Integration sicher, wenn ein Neuer überwiegend remote oder in Teilzeit startet — ohne dass er den Anschluss verliert? | Ergänzung |
| 23 | F-M28-023 | `o3b_wissenstransfer_abgang` | Wären Sie auf einen ungeplanten, kurzfristigen Abgang einer Schlüsselperson vorbereitet — ist deren Wissen so dokumentiert, dass jemand übernehmen könnte? | Ergänzung (Grenze: Wissensplattform → M-39; strukturelles Klumpenrisiko → M-26 P3c) |
| 24 | F-M28-024 | `o4a_mentoring_pate` | Haben Ihre Paten/Mentoren tatsächlich Zeit und einen Anreiz für die Betreuung — oder ist das eine zusätzliche Last, die im Alltag untergeht? | Ergänzung |

> **Auto-Dedup-Befund:** M-28 (Onboarding/Einarbeitung) ist gegenüber dem Finanz-Korpus (M-04/M-06)
> frisch — 21 der 24 Fragen sind **Ergänzungen**. Die **3 Varianten** liegen erwartungsgemäß im
> Blueprint-Personal-/Prozessblock, der auf m28 routet: F-M28-004 ↔ F-BP-006 (Eigenständigkeits-Hälfte),
> F-M28-008 ↔ F-BP-006 (Wissensverlust-Hälfte), F-M28-007 ↔ F-BP-011 (Onboarding-Aspekt „Neuer an
> Tag 1"). Damit ist die Doppel-Frage F-BP-006 sauber über das HR-Trio geteilt: **strukturelles
> Klumpenrisiko** = M-26 (F-M26-007), **Zeit bis Eigenständigkeit** + **Wissensverlust** = M-28.
> F-BP-011 wird zwischen **M-39** (Prozess-Doku/Wissensplattform, primär) und **M-28** (der
> Onboarding-Zugriff darauf) geteilt. Trio-Schnitt vollständig: **M-26** Bedarf/Struktur, **M-27**
> Beschaffung/Attraktivität, **M-28** Onboarding/Wissenssicherung. Grenzen zu M-39 (Wissensplattform),
> M-27 R3b (Azubi-Bindung während Ausbildung), M-26 P3c (Klumpenrisiko), M-02 (Rollen/Governance)
> und M-30 (laufende PE, nicht im Cut) sind je Frage vermerkt. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M28-001 | Onboarding-Plan-Generator (Standard-Einarbeitungsplan pro Rolle: Checklisten, Zeitplan, Meilensteine) | 1 | O1a/O2c; F-M28-001, F-M28-006 |
| H-M28-002 | Preboarding-Aufgaben-/Zugangs-Checkliste (Technik, DATEV-Rechte, Arbeitsplatz automatisch angestoßen) | 2 | O1b; F-M28-002, F-M28-013 |
| H-M28-003 | Einarbeitungs-Fortschritts-Tracking (wo steht der Neue, wo hakt es — Meilenstein-Status) | 2 | O2c/O2a; F-M28-006, F-M28-004 |
| H-M28-004 | Mentoring-/Paten-Matching & -Steuerung (wer betreut wen, Aufgaben/Termine, Belastung sichtbar) | 2 | O4a; F-M28-009, F-M28-024 |
| H-M28-005 | Probezeit-Feedback-Assistent (strukturierte Zwischengespräche, Frühwarnung Fehlbesetzung) | 2 | O5a; F-M28-010, F-M28-018 |
| H-M28-006 | „Wie machen wir das hier"-Assistent für Neue (durchsuchbare Muster/Checklisten statt Kollegen fragen) | 3 | O3a/O4a; F-M28-007, F-M28-009 (nutzt Wissensplattform → M-39) |
| H-M28-007 | Wissenstransfer-/Offboarding-Assistent (bei Abgang Mandatswissen strukturiert sichern & übergeben) | 3 | O3b; F-M28-008, F-M28-023 (Grenze M-39) |
| H-M28-008 | Zielgruppen-Onboarding-Pfade (Azubi/Quereinsteiger/Remote automatisch differenziert) | 3 | O6; F-M28-020, F-M28-021, F-M28-022 |
| H-M28-009 | Frühfluktuations-Frühwarnung (Abbruch-Risiko in den ersten Monaten erkennen) | 4 | O5b; F-M28-011, F-M28-019 |
| H-M28-010 | Time-to-Productivity-Analyse (Einarbeitungsdauer messen, Engpässe/Muster über Einstellungen) | 4 | O2a; F-M28-004, F-M28-016 |
| H-M28-011 | Onboarding-Buddy-Chatbot (Neue fragen KI statt laufend Kollegen zu unterbrechen) | 3 | O3a; F-M28-007, F-M28-022 |

## 6. Output-Contract (`metadata.output_contract`)

Aus den M-28-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. strukturierten Onboarding-Plan einführen, Onboarding-Owner benennen, Paten-System aufsetzen, Einarbeitungszeit budgetieren, Offboarding-/Wissenstransfer-Pflicht festlegen).
- `standard` — welche Norm/Routine gilt (z. B. Standard-Einarbeitungsplan je Rolle, Preboarding-Checkliste, feste Probezeit-Feedbackgespräche, Meilenstein-Checkpoints, geordnete Mandatsübergabe bei Abgang).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Onboarding-Checkliste erstellen, Zugangs-Setup vor Tag 1 automatisieren, Paten benennen, Probezeit-Gesprächstermine setzen, Offboarding-Wissenstransfer-Vorlage anlegen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m28`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
