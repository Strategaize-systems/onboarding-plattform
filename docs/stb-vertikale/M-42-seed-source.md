# M-42 Seed-Source — Unternehmer-Rolle & Entscheidungsklarheit (SLC-170b, Welle 4)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m42` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-42 ist die **persönlich-psychologische**
> Standortbestimmung des Inhabers — Rollen-Selbstverständnis, Entscheidungs-Haltung,
> Loslass-Bereitschaft, eigenes Zukunfts-Wozu. Es ist **Selbst-Reflexion / Standortbestimmung**,
> **kein psychologisches oder therapeutisches Beratungsangebot** und kein Coaching-Ersatz.
> Alle Fragen sind offene Selbst-Reflexion, die dem Inhaber die eigene Haltung als Übergabe-Hebel
> sichtbar macht; die KI-Hebel spiegeln/strukturieren, treffen aber keine persönlichen
> Wertungen an seiner Stelle. Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Inhaber-Rolle / Loslassen / Nachfolge-Psychologie Steuerkanzlei (Persönliche Kompetenz-Module,
> „Loslassen/Inhaberabhängigkeit = härtester Übergabe-Hebel", DEC-242-Hochstufung ↑). Tiefen-/
> Format-Maßstab + Auto-Dedup-Korpus: `M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35-seed-source.md`.
> Kein recyceltes exit_readiness-Material (DEC-234).
> **16 Fragen (8 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m42` |
| `version` | `1.0` |
| `name` | M-42 – Unternehmer-Rolle & Entscheidungsklarheit |
| Kategorie | Persönliche Kompetenz-Module (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m42` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 16 (8 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04-, M-06-, M-07-, M-26-, M-27-, M-28-
und M-35-Seed (MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks abgebildet; die
Modul-Spec-Spalte „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M42-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (U1..U6 / Uxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen/reflexiv |
| Typ („offen") | — | M-42 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell U1–U6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Selbst-Reflexions-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-42-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später). Auch
wenn M-42 thematisch die Inhaberabhängigkeit adressiert, bleibt das `owner_dependency`-Flag
`false` — es ist ein Delivery-/Scoring-Marker (künftiger `/module-delivery`), kein Content-Feld.

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m42`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| U1 | Rollen-Selbstverständnis & Identität | `u1a_rolle_heute` | Rolle heute — operative Fachkraft/Macher vs. gestaltender Unternehmer (IM vs. AM Unternehmen) |
| | | `u1b_identitaet_verschmelzung` | Identität/Selbstwert mit der Kanzlei verschmolzen („die Kanzlei bin ich") |
| | | `u1c_unverzichtbarkeit_motiv` | Gebrauchtwerden-/Unersetzlichkeits-Motiv |
| U2 | Entscheidungsklarheit & Entscheidungs-Haltung | `u2a_entscheidungsstil` | Entscheidungsstil — klar/zügig vs. abwägen/aufschieben |
| | | `u2b_entscheidungs_hoarding` | Entscheidungs-Hoarding als Haltung („nur ich kann das richtig") |
| | | `u2c_prioritaeten_klarheit` | Prioritäten-Klarheit — am Wichtigen vs. im Tagesgeschäft verlieren (Haltung, keine Zeittools) |
| U3 | Loslassen & Delegation (Vertrauen/Kontrolle) | `u3a_delegationsfaehigkeit` | Delegationsfähigkeit — abgeben vs. zurückholen/Micromanagement |
| | | `u3b_vertrauen_kontrolle` | Vertrauen ins Team vs. Kontroll-/Qualitätsangst |
| | | `u3c_fehlertoleranz` | Fehlertoleranz — andere dürfen es anders/mit Fehlern machen |
| U4 | Übergabe-/Loslass-Bereitschaft (emotional) | `u4a_loslass_bereitschaft` | Innere Bereitschaft zu übergeben/kürzertreten |
| | | `u4b_angst_danach` | Angst vor Bedeutungsverlust/Leere danach, Bild vom „danach" |
| | | `u4c_aufschub_haltung` | Emotionaler Aufschub („noch nicht dran"), ehrlicher Grund |
| U5 | Persönliche Vision & Zukunfts-Wozu | `u5a_persoenliches_zielbild` | Eigenes 5–10-Jahr-Berufs-/Lebensbild (voll dabei / reduziert / raus) |
| | | `u5b_wozu_jenseits_kanzlei` | Sinn/Aufgabe/Struktur jenseits der Kanzlei |
| | | `u5c_balance_gesundheit_druck` | Persönliche Belastung/Gesundheit/Balance als Handlungsdruck |
| U6 | Haltung → Wirkung auf die Kanzlei (Brücke f1) | `u6a_haltung_ursache_abhaengigkeit` | Eigene Haltung als Ursache der Inhaberabhängigkeit |
| | | `u6b_sich_ueberfluessig_machen` | Aktiv daran arbeiten, dass es ohne den Inhaber läuft (Haltung) |
| | | `u6c_vorbild_kultur` | Inhaber als Verhaltens-/Kultur-Vorbild fürs Loslassen |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M42-001 | `u1a_rolle_heute` | Wenn Sie eine typische Arbeitswoche anschauen: Wie viel Ihrer Zeit arbeiten Sie *im* Tagesgeschäft mit (selbst Mandate bearbeiten, fachlich einspringen) und wie viel *am* Unternehmen (Richtung, Aufbau, Führung) — und mit welcher Rolle identifizieren Sie sich eigentlich? | Ergänzung |
| 2 | F-M42-002 | `u1b_identitaet_verschmelzung` | Wie stark ist Ihr Selbstverständnis mit der Kanzlei verschmolzen — würden Sie sagen „die Kanzlei bin ich", und was bliebe von Ihrer Rolle/Identität, wenn Sie sie eines Tages nicht mehr führen? | Ergänzung |
| 3 | F-M42-003 | `u2b_entscheidungs_hoarding` | Bei welchen Entscheidungen haben Sie das Gefühl, dass letztlich nur Sie sie richtig treffen können — und wie viele Dinge landen deshalb am Ende doch wieder bei Ihnen auf dem Tisch? | Ergänzung (Grenze: formale Entscheidungs-/Vertretungsprozesse → M-03; hier die persönliche Haltung dahinter) |
| 4 | F-M42-004 | `u3a_delegationsfaehigkeit` | Woran merken Sie bei sich selbst, dass Sie etwas nicht wirklich abgeben, sondern nur „ausleihen" — holen Sie Aufgaben oder Entscheidungen zurück, sobald es nicht so läuft wie bei Ihnen? | Ergänzung |
| 5 | F-M42-005 | `u3b_vertrauen_kontrolle` | Wie sehr vertrauen Sie darauf, dass Ihr Team Mandate fachlich in Ihrer Qualität bearbeitet — und wo sitzt bei Ihnen die größere Angst: dass fachlich etwas schiefgeht, oder dass Sie die Kontrolle verlieren? | Ergänzung |
| 6 | F-M42-006 | `u4a_loslass_bereitschaft` | Ganz ehrlich zu sich selbst: Wollen Sie eigentlich loslassen — kürzertreten, übergeben, sich zurückziehen — oder ist das eher etwas, von dem Sie glauben, dass Sie es „irgendwann müssen"? | Ergänzung (Kern-Nerv des Moduls; Grenze: vertragliche Nachfolge → M-35, Kandidat vorhanden → M-26 F-M26-009) |
| 7 | F-M42-007 | `u6a_haltung_ursache_abhaengigkeit` | Wenn Sie selbstkritisch draufschauen: Wie viel der Abhängigkeit der Kanzlei von Ihnen — dass Mandate, Wissen und Entscheidungen an Ihnen kleben — ist über die Jahre durch Ihre eigene Haltung entstanden (alles selbst machen, alles kontrollieren, unersetzlich sein)? | Variante von F-BP-013 (M-BP misst die Inhaberabhängigkeit strukturell — „welche Mandate halten zu Ihnen persönlich"; hier die persönliche *Ursache*/Haltung dahinter, primäres f1-Zielmodul) |
| 8 | F-M42-008 | `u5a_persoenliches_zielbild` | Haben Sie ein klares Bild davon, wie Ihr eigenes Berufs-/Lebensbild in 5–10 Jahren aussehen soll (weiter voll dabei, reduzierte Rolle, ganz raus) — oder ist diese Frage für Sie persönlich noch unbeantwortet? | Ergänzung (Grenze: Zukunft des *Geschäfts*/Standorts → M-01; hier das eigene *Selbst*) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 9 | F-M42-009 | `u1c_unverzichtbarkeit_motiv` | Wie wichtig ist Ihnen das Gefühl, in der Kanzlei gebraucht und unersetzlich zu sein — und was würde es mit Ihnen machen, wenn der Laden eines Tages auch ohne Sie rundliefe? | Ergänzung |
| 10 | F-M42-010 | `u2a_entscheidungsstil` | Wie treffen Sie Entscheidungen — eher klar und zügig oder eher abwägend und aufschiebend — und welche wichtige Entscheidung schieben Sie gerade konkret vor sich her? | Ergänzung |
| 11 | F-M42-011 | `u2c_prioritaeten_klarheit` | Haben Sie Klarheit darüber, welche zwei, drei Dinge in Ihrer Rolle wirklich nur Sie voranbringen können — oder verlieren Sie sich im Tagesgeschäft an Dingen, die auch andere erledigen könnten? | Ergänzung (Grenze: Zeit-/Selbstorganisations-Tools → M-46, nicht im Cut; hier die Prioritäten-Klarheit als Haltung) |
| 12 | F-M42-012 | `u3c_fehlertoleranz` | Dürfen Ihre Leute Dinge anders machen als Sie — auch wenn dabei mal ein Fehler passiert — oder erwarten Sie im Kern, dass es so gemacht wird, wie Sie es tun würden? | Ergänzung |
| 13 | F-M42-013 | `u4b_angst_danach` | Wenn Sie an die Zeit *nach* der aktiven Kanzleiführung denken: Gibt es da eine Vorstellung, worauf Sie sich freuen — oder eher eine Leere/Sorge vor Bedeutungsverlust, die das Thema lieber wegschieben lässt? | Ergänzung |
| 14 | F-M42-014 | `u5b_wozu_jenseits_kanzlei` | Gibt es in Ihrem Leben etwas jenseits der Kanzlei — Aufgaben, Interessen, Menschen — das Ihnen Sinn und Struktur geben würde, wenn die Kanzlei weniger Raum einnimmt? | Ergänzung (Grenze: persönliches Zielbild → U5a-Kern; hier das *Wozu* dahinter) |
| 15 | F-M42-015 | `u6b_sich_ueberfluessig_machen` | Arbeiten Sie aktiv darauf hin, sich in Teilen selbst überflüssig zu machen (Wissen teilen, Mandate übergeben, Verantwortung abgeben) — oder ist das eher ein Vorsatz als gelebte Praxis? | Ergänzung (Grenze: die *strukturellen* Maßnahmen → M-02/M-26; hier die persönliche Haltung/Konsequenz) |
| 16 | F-M42-016 | `u4c_aufschub_haltung` | Das Thema Übergabe/Kürzertreten begleitet viele Inhaber jahrelang als „noch nicht dran": Was ist bei Ihnen der ehrliche Grund, dass es (noch) nicht weitergeht — Zeit, kein Nachfolger, oder eigentlich fehlende innere Bereitschaft? | Ergänzung (scharfe Aha-Frage; trennt bewusst die *innere* Ursache heraus — Grenze: Nachfolger-Verfügbarkeit → M-26 F-M26-009, Vertrag → M-35) |

> **Auto-Dedup-Befund:** M-42 (persönlich-psychologische Inhaber-Ebene) ist gegenüber dem
> gesamten Korpus **frisch** — 15 der 16 Fragen sind **Ergänzungen**. Die **eine Variante**
> (F-M42-007) liegt auf **F-BP-013** (`f1_inhaberabhaengigkeit`, primäres Zielmodul m42): der
> Blueprint **misst** die Inhaberabhängigkeit strukturell, M-42 **vertieft** ihre persönliche
> *Ursache/Haltung*. M-42 ist zudem der **explizite Ziel-Anker** für die „persönliches
> Loslassen → M-42"-Grenzverweise der Nachbarn (F-M26-009, F-M35-020, F-M35-023). Grenzen
> sauber gezogen: **M-35** (rechtlich-vertragliche Nachfolge/§69/Praxiswert — M-42 hält die
> *Bereitschaft*), **M-26 P6** (personelle Nachfolge-*Verfügbarkeit*/Führungspipeline — M-42
> hält das *Abgeben-Wollen*), **M-03** (formale Entscheidungs-/Governance-*Prozesse* — M-42
> hält das Entscheidungs-*Hoarding als Haltung*), **M-01** (laufende Werttreiber/Standort — M-42
> hält das eigene *Zukunfts-Selbst*), **M-46** (Selbstorganisation/Zeittools — nicht im Cut).
> **Bewusst gedeckelt** (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt):
> `u5c_balance_gesundheit_druck` und `u6c_vorbild_kultur` sind im Themenbaum angelegt, aber in
> v1.0 **ohne eigene Frage** — Kandidaten für v1.1, falls das Modul vertieft wird. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

> Alle Hebel sind **spiegelnd/strukturierend** (Selbst-Reflexion) und **ersetzen keine
> psychologische/therapeutische oder Coaching-Beratung** (siehe Framing §6). Für ein
> persönliches Modul liegt der Nutzen in Reflexions-Struktur, Muster-Sichtbarkeit und
> Fortschritts-Tracking — nicht in Automatisierung.

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M42-001 | Rollen-Spiegel (Selbst-Einordnung IM- vs. AM-Unternehmen, Zeitverwendungs-Reflexion + Muster-Feedback) | 2 | U1a/U2c; F-M42-001, F-M42-011 |
| H-M42-002 | Loslass-Readiness-Check (strukturierter Reflexions-Fragebogen zur emotionalen Übergabe-Bereitschaft, Reifegrad-Radar Person) | 2 | U4; F-M42-006, F-M42-013, F-M42-016 |
| H-M42-003 | Delegations-/Rückhol-Tracker (welche Aufgaben & Entscheidungen holt der Inhaber zurück — Muster sichtbar machen) | 2 | U2b/U3a; F-M42-003, F-M42-004 |
| H-M42-004 | Entscheidungs-Journal & Aufschub-Radar (verschleppte Entscheidungen erfassen, Muster + sanfter Nudge) | 2 | U2a; F-M42-010 |
| H-M42-005 | Inhaberabhängigkeits-Ursachen-Analyse (verknüpft die eigene Haltung mit der strukturellen f1-Diagnose, macht selbstverursachte Klumpen sichtbar) | 3 | U6a; F-M42-007 |
| H-M42-006 | Persönliches Zielbild-/Zukunfts-Sparring (Reflexions-Dialog zum eigenen 5–10-Jahr-Bild jenseits der Kanzlei) | 3 | U5; F-M42-008, F-M42-014 |
| H-M42-007 | „Sich-überflüssig-machen"-Fahrplan (persönliche Loslass-Schritte in konkrete Wochen-/Monatsvorsätze übersetzen, Fortschritt tracken) | 3 | U6b; F-M42-015 |
| H-M42-008 | Übergabe-Reife-Radar Person (Gesamtbild persönliche Übergabefähigkeit über alle 6 Bereiche — Haltungs-Gegenstück zum M-35 Nachfolge-Reifegrad-Radar) | 4 | U1–U6; F-M42-006, F-M42-007, F-M42-016 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-42-Output):** persönliche Selbst-Reflexion / Standortbestimmung
> zur Unternehmer-Rolle, **kein psychologisches/therapeutisches Beratungsangebot** und kein
> Coaching-Ersatz. Die Ausgabe spiegelt die eigenen Angaben zurück und macht die Haltung als
> Übergabe-Hebel sichtbar; sie trifft keine Wertung an Stelle des Inhabers.

Aus den M-42-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was der Inhaber für sich entscheiden sollte (z. B. sich bewusst aus einem
  operativen Bereich zurückziehen, eine konkrete Entscheidungsklasse dauerhaft ans Team abgeben,
  ein eigenes Zukunftsbild festlegen, den ehrlichen Aufschub-Grund adressieren).
- `standard` — welche persönliche Routine/Haltung gilt (z. B. „am Unternehmen statt im
  Unternehmen"-Zeitbudget, delegierte Entscheidungen nicht zurückholen, regelmäßige Reflexion
  zum Loslass-Reifegrad, dokumentiertes persönliches Zielbild).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. eine Aufgabe diese Woche komplett
  abgeben und nicht kontrollieren, ein Zielbild-Gespräch/Sparring terminieren, den Rückhol-Reflex
  eine Woche protokollieren, ein Loslass-Vorhaben in einen 90-Tage-Vorsatz übersetzen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m42`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
