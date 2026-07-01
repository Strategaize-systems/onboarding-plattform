# M-03 Seed-Source — Entscheidungsprozesse & Governance (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m03` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-03 ist die **Standortbestimmung der formalen
> Entscheidungs- und Governance-Struktur** — Entscheidungswege, Befugnisse/Delegation,
> Gesellschafter-/Führungs-Governance, Meeting-/Abstimmungs-Taktung, Nachvollziehbarkeit,
> Übergabefähigkeit der Entscheidungsstruktur. Bewusst getrennt von der *Haltung* zum Entscheiden
> (M-42), den *Rollen/der Struktur* (M-02), der *gesellschaftsrechtlichen* Beschlussfassung (M-35)
> und der *personellen* Führungspipeline (M-26). Alle Fragen sind offen; die KI-Hebel
> strukturieren/prüfen. Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Entscheidung / Governance Steuerkanzlei (Führung & Struktur; StB-Begründung „Wer entscheidet,
> Stellvertretung — Übergabe-relevant"). Blueprint-Anker: `f1_inhaberabhaengigkeit` **sekundär**
> m03 (primär m42). Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein recyceltes
> exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m03` |
| `version` | `1.0` |
| `name` | M-03 – Entscheidungsprozesse & Governance |
| Kategorie | Führung & Struktur (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m03` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 17 (9 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-01-, M-02-, M-04-, M-06-, M-07-,
M-26-, M-27-, M-28-, M-35- und M-42-Seed (MIG-029 / MIG-125). Die zwei Stufen werden auf zwei
Blocks abgebildet; die Modul-Spec-Spalte „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in
`question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M03-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (E1..E6 / Exa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `E` = Entscheidung (M-03-modul-scoped; nicht zu verwechseln mit M-BP Block E) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-03 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell E1–E6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Governance-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-03-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m03`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| E1 | Entscheidungsstruktur & -wege | `e1a_entscheidungswege` | Wie/wo Entscheidungen getroffen werden (feste Wege vs. ad hoc) |
| | | `e1b_entscheidungstypen` | Entscheidungsarten (operativ/personell/finanziell/strategisch) — wer entscheidet was |
| | | `e1c_zentral_vs_verteilt` | Zentralisierung beim Inhaber vs. verteilt (Grenze: als Haltung → M-42) |
| E2 | Befugnisse & Delegation (formal) | `e2a_befugnisse_grenzen` | Definierte Entscheidungs-/Freigabegrenzen (Betrag, Mandat, Personal) |
| | | `e2b_delegierte_befugnis` | Formal delegierte Entscheidungen (Grenze: Bereitschaft → M-42 U3, Rolle → M-02) |
| | | `e2c_eskalation` | Eskalations-/Rückkopplungswege (wann geht was nach oben) |
| E3 | Gesellschafter-/Führungs-Governance | `e3a_partner_abstimmung` | Operative Partner-/Gesellschafter-Abstimmung im Alltag (Grenze: Stimmrechte/Verträge → M-35 G2a) |
| | | `e3b_gremien_runden` | Feste Führungs-/Gesellschafterrunden (Jour fixe, Führungskreis) |
| | | `e3c_rollen_gesellschafter_gf` | Trennung Gesellschafter- vs. Geschäftsführungsrolle im Entscheiden |
| E4 | Meeting- & Abstimmungs-Taktung | `e4a_entscheidungs_meetings` | Feste Runden, in denen entschieden wird (vs. Flurentscheidungen; Grenze: Meetings allg. → M-40) |
| | | `e4b_entscheidungsreife` | Kommen Entscheidungen entscheidungsreif aufbereitet |
| | | `e4c_taktung_geschwindigkeit` | Taktung/Geschwindigkeit prozessual (Grenze: pers. Aufschub-Stil → M-42 U2a) |
| E5 | Nachvollziehbarkeit & Verbindlichkeit | `e5a_dokumentation` | Entscheidungen + Begründung festgehalten (Grenze: Wissensplattform → M-39) |
| | | `e5b_kommunikation_umsetzung` | Entscheidungen ins Team kommuniziert & umgesetzt |
| | | `e5c_nachverfolgung_verbindlichkeit` | Maßnahmen-/Beschluss-Nachverfolgung (Verbindlichkeit vs. versanden) |
| E6 | Governance-Reife & Übergabefähigkeit | `e6a_entscheidungsfaehig_ohne_inhaber` | Bleibt die Kanzlei ohne den Inhaber entscheidungsfähig |
| | | `e6b_governance_dokumentiert` | Governance/Entscheidungsregeln dokumentiert vs. im Kopf des Inhabers |
| | | `e6c_governance_weiterentwicklung` | Governance bewusst weiterentwickelt vs. historisch/ad hoc |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-01/M-02/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M03-001 | `e1a_entscheidungswege` | Wie werden Entscheidungen in Ihrer Kanzlei getroffen — laufen sie über feste, klare Wege, oder eher situativ und ad hoc, je nachdem, wer gerade zuständig oder da ist? | Ergänzung |
| 2 | F-M03-002 | `e1b_entscheidungstypen` | Unterscheiden Sie bewusst zwischen Entscheidungsarten (operativ-fachlich, personell, finanziell, strategisch) — und ist bei jeder Art klar, wer sie treffen darf? | Ergänzung |
| 3 | F-M03-003 | `e1c_zentral_vs_verteilt` | Laufen bei Ihnen faktisch alle wesentlichen Entscheidungen über den Inhaber — oder gibt es Bereiche, in denen andere eigenständig und verbindlich entscheiden? | Variante von F-M26-023 (M-26: ob eine Führungs-/Teamleiter-Ebene existiert, personell — M-26 defert Governance explizit hierher; hier die Entscheidungs-Zentralisierung als Prozess; Grenze: als Haltung → M-42 F-M42-003) |
| 4 | F-M03-004 | `e2a_befugnisse_grenzen` | Gibt es definierte Entscheidungs- und Freigabegrenzen (bis zu welchem Betrag, welcher Mandats-/Personalentscheidung darf wer allein entscheiden) — oder ist das nirgends festgelegt? | Ergänzung |
| 5 | F-M03-005 | `e2c_eskalation` | Ist klar, wann und wie eine Entscheidung eskaliert wird — wann etwas an Sie oder die Führung heraufgereicht werden muss und wann nicht? | Ergänzung |
| 6 | F-M03-006 | `e3a_partner_abstimmung` | Falls Sie mehrere Gesellschafter/Partner sind: Wie stimmen Sie sich im operativen Alltag ab und treffen gemeinsame Entscheidungen — funktioniert das eingespielt, oder gibt es regelmäßig Reibung/Blockaden? | Ergänzung (Grenze: vertragliche Stimmrechte/Gewinnverteilung → M-35 G2a; hier die operative Abstimmung) |
| 7 | F-M03-007 | `e4a_entscheidungs_meetings` | Gibt es feste Runden/Meetings, in denen Entscheidungen strukturiert getroffen werden — oder passieren wichtige Entscheidungen eher zwischen Tür und Angel? | Ergänzung (Grenze: allgemeine Meetingstruktur → M-40, nicht im Cut; hier die Entscheidungs-Taktung) |
| 8 | F-M03-008 | `e5b_kommunikation_umsetzung` | Werden getroffene Entscheidungen klar ins Team kommuniziert und dann auch umgesetzt — oder versanden Beschlüsse häufig, weil sie nicht ankommen oder nicht nachverfolgt werden? | Ergänzung |
| 9 | F-M03-009 | `e6a_entscheidungsfaehig_ohne_inhaber` | Wenn Sie für längere Zeit ausfielen: Bliebe Ihre Kanzlei entscheidungsfähig — wüssten die Leute, wer was entscheiden darf — oder blieben wichtige Entscheidungen einfach liegen, bis Sie zurück sind? | Variante von F-BP-013 (f1-Inhaberabhängigkeit, sekundäres Zielmodul m03; hier die *Entscheidungs*-Seite: bleibt die Kanzlei ohne den Inhaber entscheidungsfähig; Grenze: Mandats-/Wissens-Bindung → M-42/M-02) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M03-010 | `e2b_delegierte_befugnis` | Welche Entscheidungen haben Sie formal an Rollen/Personen delegiert — sodass diese wirklich verbindlich entscheiden dürfen, nicht nur vorbereiten — und woran erkennt das Team, wo diese Grenze liegt? | Ergänzung (Grenze: die persönliche Delegations-*Bereitschaft* → M-42 U3; die strukturelle Rolle → M-02) |
| 11 | F-M03-011 | `e3b_gremien_runden` | Gibt es feste Führungs-/Gesellschafterrunden (Jour fixe, Führungskreis), in denen Sie steuern und entscheiden — mit fester Taktung und Agenda — oder passiert das unregelmäßig und anlassbezogen? | Ergänzung |
| 12 | F-M03-012 | `e3c_rollen_gesellschafter_gf` | Ist bei Ihnen klar getrennt, wann jemand als Gesellschafter (Eigentümerinteresse) und wann als Geschäftsführung (operative Leitung) entscheidet — oder vermischt sich das? | Ergänzung (Grenze: die gesellschaftsrechtliche Beteiligungs-/Rollenstruktur → M-35; hier die operative Rollen-Trennung im Entscheiden) |
| 13 | F-M03-013 | `e4b_entscheidungsreife` | Kommen Entscheidungen bei Ihnen entscheidungsreif auf den Tisch (Optionen, Zahlen, Empfehlung aufbereitet) — oder müssen Sie vieles selbst erst aufbereiten, bevor überhaupt entschieden werden kann? | Ergänzung |
| 14 | F-M03-014 | `e4c_taktung_geschwindigkeit` | Werden Entscheidungen bei Ihnen zügig getroffen und kommen dann voran — oder bleiben Entscheidungen häufig liegen und ziehen sich, weil der Prozess dafür fehlt? | Ergänzung (Grenze: der *persönliche* Aufschub-Stil des Inhabers → M-42 U2a; hier die prozessuale Entscheidungs-Geschwindigkeit) |
| 15 | F-M03-015 | `e5a_dokumentation` | Werden wichtige Entscheidungen und ihre Begründung irgendwo festgehalten — sodass später nachvollziehbar ist, was warum entschieden wurde — oder lebt das nur im Gedächtnis der Beteiligten? | Ergänzung (Grenze: die zentrale Wissensplattform → M-39; hier die Entscheidungs-Nachvollziehbarkeit) |
| 16 | F-M03-016 | `e5c_nachverfolgung_verbindlichkeit` | Wie verbindlich sind Beschlüsse bei Ihnen — gibt es eine Maßnahmen-/Beschluss-Nachverfolgung (wer macht was bis wann) — oder werden Dinge beschlossen und dann doch nicht umgesetzt? | Ergänzung |
| 17 | F-M03-017 | `e6b_governance_dokumentiert` | Sind Ihre Entscheidungsregeln und Zuständigkeiten irgendwo dokumentiert (wer entscheidet was, welche Grenzen, welche Eskalation) — oder steckt diese Governance vor allem in Ihrem Kopf? | Ergänzung (Grenze: Wissensplattform/Doku-Ablage → M-39; hier der Governance-Reifegrad) |

> **Auto-Dedup-Befund:** M-03 (Entscheidungsprozesse & Governance) ist gegenüber dem Korpus
> weitgehend frisch — **15 Ergänzungen, 2 Varianten**. Beide Varianten liegen auf der
> Inhaberabhängigkeits-/Zentralisierungs-Achse: **F-M03-003 ↔ F-M26-023** (M-26 fragt nach der
> *personellen* Führungsebene und defert die Governance explizit hierher; M-03 vertieft die
> *Entscheidungs-Zentralisierung als Prozess*) und **F-M03-009 ↔ F-BP-013** (f1, sekundäres
> Zielmodul m03; hier die *Entscheidungs-Seite* der Inhaberabhängigkeit). Grenzen sauber gezogen:
> **M-02** (Rollen/Struktur — M-03 = Entscheidungswege), **M-42** (Entscheidungs-Hoarding/Stil als
> *Haltung* — M-42 F-M42-003 defert den *Prozess* hierher), **M-35** (gesellschaftsrechtliche
> Stimmrechte/Beschlussfassung im Vertrag, G2a — M-03 = operative Abstimmung), **M-26**
> (Führungspipeline *personell* — M-03 = Entscheidungswege), **M-39** (Wissens-/Doku-Ablage — M-03
> = Entscheidungs-Nachvollziehbarkeit), **M-40** (Meetingstruktur allg. — nicht im Cut).
> **Bewusst gedeckelt** (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt):
> `e6c_governance_weiterentwicklung` ist im Themenbaum angelegt, aber in v1.0 ohne eigene Frage
> (implizit in F-M03-017) — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M03-001 | Entscheidungs-Kompetenz-Matrix (welche Entscheidungsart wer treffen/freigeben darf, Grenzen + Eskalation) | 2 | E1/E2; F-M03-002, F-M03-004, F-M03-005 |
| H-M03-002 | Entscheidungswege-Analyse (zentral vs. verteilt, wo alles über den Inhaber läuft) | 2 | E1; F-M03-001, F-M03-003 |
| H-M03-003 | Delegations-/Freigabe-Designer (Entscheidungen formal an Rollen delegieren, Grenzen sichtbar machen) | 3 | E2b; F-M03-010 |
| H-M03-004 | Entscheidungs-Meeting-/Jour-fixe-Struktur (feste Entscheidungsrunden, Agenda, Entscheidungsreife-Check) | 2 | E4; F-M03-007, F-M03-011, F-M03-013 |
| H-M03-005 | Beschluss-/Maßnahmen-Tracker (getroffene Entscheidungen dokumentieren, Umsetzung nachverfolgen) | 2 | E5; F-M03-008, F-M03-015, F-M03-016 |
| H-M03-006 | Partner-/Gesellschafter-Abstimmungs-Assistent (operative Abstimmung strukturieren, Blockade-/Deadlock-Früherkennung) | 2 | E3; F-M03-006, F-M03-012 (Grenze: vertragliche Deadlock-Regel → M-35 H-M35-002) |
| H-M03-007 | Governance-Dokumentations-Generator (Entscheidungsregeln/Zuständigkeiten aus dem Kopf in ein Governance-Dokument) | 3 | E6b; F-M03-017 |
| H-M03-008 | Governance-/Entscheidungsfähigkeits-Radar (bleibt die Kanzlei ohne den Inhaber entscheidungsfähig — Gesamtbild Governance-Reife) | 4 | E1–E6; F-M03-003, F-M03-009 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-03-Output):** Selbst-Diagnose der Entscheidungs-/Governance-
> Struktur, keine Rechts-/Unternehmensberatung im Einzelfall. Die Ausgabe strukturiert die eigenen
> Angaben und macht Governance-Lücken sichtbar.

Aus den M-03-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Entscheidungsbefugnisse/Freigabegrenzen festlegen,
  Entscheidungsarten den Rollen zuordnen, ein Entscheidungs-/Führungsgremium einführen, Governance
  vom Kopf ins Dokument überführen, Partner-Abstimmung neu regeln).
- `standard` — welche Norm/Routine gilt (z. B. definierte Entscheidungs-/Freigabegrenzen + Eskalation,
  fester Entscheidungs-Jour-fixe mit Agenda, dokumentierte Beschlüsse mit Maßnahmen-Nachverfolgung,
  klare Trennung Gesellschafter- vs. Geschäftsführungsrolle, regelmäßiger Governance-Review).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Entscheidungs-Kompetenz-Matrix
  aufsetzen, Freigabegrenzen dokumentieren, Beschluss-/Maßnahmen-Tracker einführen, eine
  Entscheidung formal an eine Rolle delegieren, Jour-fixe-Taktung einführen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m03`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
