# M-15 Seed-Source — Positionierung & Kernbotschaften (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m15` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-02 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-15 ist die **Standortbestimmung der
> Positionierung** — wofür die Kanzlei nach außen steht, Nutzenversprechen, Kernbotschaften,
> Differenzierung, Zielgruppen-Ansprache, Außenauftritts-Konsistenz. Bewusst getrennt von den
> *Zielkunden/dem Vertrieb* (M-08), den *Lead-Kanälen* (M-16) und der *Geschäftsmodell*-Weichen-
> stellung (M-01). Alle Fragen sind offen; die KI-Hebel strukturieren/prüfen. Dieser Framing-
> Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-02 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Positionierung / Kernbotschaften Steuerkanzlei (Marketing; xlsx-Kurzbeschreibung „Was das
> Unternehmen nach außen behauptet zu sein, Nutzenversprechen, Abgrenzung zu Wettbewerbern").
> Blueprint-Anker: `c2_positionierung` **primär** m15 (sekundär m16); `c1_beratungsverschiebung`
> **sekundär** m15. Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein
> recyceltes exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m15` |
| `version` | `1.0` |
| `name` | M-15 – Positionierung & Kernbotschaften |
| Kategorie | Marketing & Leadgenerierung (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m15` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 17 (9 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum bisherigen StB-Seed-Korpus (MIG-029 / MIG-125). Die zwei
Stufen werden auf zwei Blocks abgebildet; „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in
`question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M15-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (M1..M6 / Mxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `M` = Marktauftritt/Positionierung (M-15-modul-scoped; Kleinbuchstabe `m1a…`, nicht zu verwechseln mit Modul-Code M-15) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell M1–M6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Positionierungs-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-15-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m15`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| M1 | Positionierung & Selbstverständnis | `m1a_positionierung_kern` | Wofür die Kanzlei nach außen steht |
| | | `m1b_generalist_spezialist` | Generalist vs. spezialisiert (Grenze: Modell → M-01 b6c, Zielkunden-Fokus → M-08 V1) |
| | | `m1c_selbstbild_fremdbild` | Selbstbild vs. Mandanten-Wahrnehmung |
| M2 | Nutzenversprechen & Kernbotschaften | `m2a_nutzenversprechen` | Klares Nutzenversprechen (warum-uns) |
| | | `m2b_kernbotschaften` | Definierte Kernbotschaften vs. austauschbar |
| | | `m2c_beweis_belege` | Belege/Beweise für das Versprechen (Referenzen, Ergebnisse) |
| M3 | Differenzierung & Wettbewerb | `m3a_differenzierung` | Worin erkennbar anders/besser als andere Kanzleien |
| | | `m3b_warum_uns` | Der eine Grund, warum ein Wunschmandant kommt (nicht Preis/Nähe) |
| | | `m3c_wettbewerbsbild` | Kenntnis des relevanten Wettbewerbs & eigene Position |
| M4 | Zielgruppen-Botschaft & Relevanz | `m4a_zielgruppen_ansprache` | Botschaft auf Zielgruppe zugeschnitten (Grenze: Zielkunden-Definition → M-08 V1) |
| | | `m4b_beratungs_positionierung` | Positionierung als Berater (nicht nur Compliance) — c1 |
| | | `m4c_relevanz_pain` | Botschaft adressiert echte Pains der Zielgruppe |
| M5 | Außenauftritt & Konsistenz | `m5a_auftritt_konsistenz` | Website/Materialien/Kontaktpunkte konsistent zur Positionierung (Grenze: Kanäle → M-16) |
| | | `m5b_sichtbarkeit_wahrnehmung` | Wahrnehmung als das, was man sein will (Grenze: Reputation → M-18, Kanäle → M-16) |
| | | `m5c_botschaft_gelebt` | Positionierung intern gelebt/getragen (Team kann sie erklären) |
| M6 | Positionierungs-Reife & Weiterentwicklung | `m6a_bewusst_vs_beliebig` | Bewusst geschärft vs. „alles für alle" |
| | | `m6b_zukunftsfaehig` | Passt zur Zukunft (Beratung/KI/Spezialisierung) (Grenze: Modell → M-01 b6) |
| | | `m6c_pflege_weiterentwicklung` | Regelmäßig überprüft/geschärft |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M15-001 | `m1a_positionierung_kern` | Wofür steht Ihre Kanzlei nach außen — wie würden Sie in ein, zwei Sätzen sagen, was Sie ausmacht und für wen Sie da sind? | Ergänzung |
| 2 | F-M15-002 | `m1b_generalist_spezialist` | Positionieren Sie sich als Generalist (alles für alle) oder als spezialisierte Kanzlei (Branche, Leistung, Zielgruppe) — und ist das eine bewusste Entscheidung? | Ergänzung (Grenze: Spezialisierung als Geschäftsmodell → M-01 b6c, als Zielkunden-Fokus → M-08 V1; hier die Außen-Positionierung) |
| 3 | F-M15-003 | `m2a_nutzenversprechen` | Haben Sie ein klares Nutzenversprechen — was ein Mandant konkret davon hat, mit Ihnen zu arbeiten, das über „wir machen Ihre Steuer" hinausgeht? | Ergänzung |
| 4 | F-M15-004 | `m2b_kernbotschaften` | Gibt es definierte Kernbotschaften, die Sie konsistent nach außen tragen — oder wirkt Ihr Auftritt eher austauschbar wie bei jeder anderen Kanzlei? | Ergänzung |
| 5 | F-M15-005 | `m3a_differenzierung` | Worin sind Sie erkennbar anders oder besser als vergleichbare Kanzleien in Ihrer Region/Ihrem Feld — und können Sie das konkret benennen? | Ergänzung |
| 6 | F-M15-006 | `m3b_warum_uns` | Wenn ein Wunschmandant Sie mit drei anderen Kanzleien vergleicht — was ist der eine Grund, warum er Sie nimmt, der nicht „Preis" oder „Nähe" ist? | Variante von F-BP-008 (c2-Diagnose, primäres Zielmodul m15; hier operativ vertieft; Grenze: die vertriebliche Nutzung im Gespräch → M-08 V5c) |
| 7 | F-M15-007 | `m4a_zielgruppen_ansprache` | Ist Ihre Außenbotschaft auf Ihre Wunschmandanten zugeschnitten — sprechen Sie deren Sprache und deren konkrete Themen an — oder ist sie allgemein „für jeden"? | Ergänzung (Grenze: die Zielkunden-Definition → M-08 V1; hier die Botschaft/Ansprache) |
| 8 | F-M15-008 | `m4b_beratungs_positionierung` | Positionieren Sie sich nach außen erkennbar als betriebswirtschaftlicher Berater/Partner — oder werden Sie primär als Erfüller der Steuer-/Compliance-Pflicht wahrgenommen? | Variante von F-BP-007 (c1-Diagnose, sekundäres Zielmodul m15; hier die Positionierungs-Seite; Grenze: der aktive Beratungsverkauf → M-08 V4/V5) |
| 9 | F-M15-009 | `m6a_bewusst_vs_beliebig` | Ist Ihre Positionierung bewusst geschärft und gewählt — oder eher über die Jahre so entstanden, sodass Sie im Grunde „alles für alle" machen? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M15-010 | `m1c_selbstbild_fremdbild` | Deckt sich Ihr Selbstbild mit dem, wie Ihre Mandanten Sie tatsächlich sehen — haben Sie das je gefragt — oder könnten da Welten dazwischen liegen? | Ergänzung |
| 11 | F-M15-011 | `m2c_beweis_belege` | Womit belegen Sie Ihr Nutzenversprechen nach außen (Referenzen, konkrete Ergebnisse, Fallbeispiele) — oder bleibt es bei Behauptungen ohne Beweis? | Ergänzung |
| 12 | F-M15-012 | `m3c_wettbewerbsbild` | Wissen Sie, wie sich Ihr relevanter Wettbewerb positioniert und wo Sie im Vergleich stehen — oder haben Sie das nie systematisch angeschaut? | Ergänzung |
| 13 | F-M15-013 | `m4c_relevanz_pain` | Adressiert Ihre Botschaft die echten Sorgen und Bedarfe Ihrer Zielgruppe (z. B. Digitalisierung, Nachfolge, Liquidität) — oder redet sie an dem vorbei, was Mandanten wirklich umtreibt? | Ergänzung |
| 14 | F-M15-014 | `m5a_auftritt_konsistenz` | Sind Ihr Außenauftritt und Ihre Materialien (Website, Kanzleibroschüre, Erstgespräch, Signatur) konsistent zu Ihrer Positionierung — oder sendet jeder Kontaktpunkt eine andere Botschaft? | Ergänzung (Grenze: die Kanäle/Leadgenerierung → M-16, Social/Content → M-17 nicht im Cut; hier die Konsistenz der Botschaft) |
| 15 | F-M15-015 | `m5c_botschaft_gelebt` | Können Ihre Mitarbeiter die Positionierung der Kanzlei erklären und tragen sie sie im Mandantenkontakt mit — oder lebt die Positionierung nur in Ihrem Kopf? | Ergänzung |
| 16 | F-M15-016 | `m6b_zukunftsfaehig` | Passt Ihre Positionierung noch zu einer Zukunft, in der KI die Routine übernimmt und Mandanten Beratung erwarten — oder positionieren Sie sich noch über etwas, das an Wert verliert? | Ergänzung (Grenze: die Geschäftsmodell-Weichenstellung → M-01 b6; hier die Positionierungs-Zukunftsfähigkeit) |
| 17 | F-M15-017 | `m6c_pflege_weiterentwicklung` | Überprüfen und schärfen Sie Ihre Positionierung regelmäßig — oder ist sie einmal entstanden und seither unverändert, obwohl sich Markt und Mandanten geändert haben? | Ergänzung |

> **Auto-Dedup-Befund:** M-15 (Positionierung & Kernbotschaften) ist gegenüber dem Korpus
> weitgehend frisch — **15 Ergänzungen, 2 Varianten**. Beide Varianten liegen auf dem
> Mandanten-Erwartungs-/Positionierungs-Block (C): **F-M15-006 ↔ F-BP-008** (`c2_positionierung`,
> primäres Zielmodul m15 — die „warum Sie statt andere"-Frage, operativ vertieft) und
> **F-M15-008 ↔ F-BP-007** (`c1_beratungsverschiebung`, sekundäres Zielmodul m15 — hier die
> Positionierung-als-Berater-Seite, während M-08 F-M08-009 die Vertriebs-Seite hält). Grenzen
> sauber gezogen: **M-08** (Zielkunden + Vertriebsgespräch — M-15 = die Botschaft; M-08 V5c defert
> die Botschaft explizit hierher), **M-16** (Lead-*Kanäle* — M-15 = Botschaft, nicht Verteilung),
> **M-01** (Spezialisierung/Werttreiber als *Modell* — M-15 = als Außen-Positionierung),
> **M-17/M-18** (Social/Content, Reputation — nicht im Cut). **Bewusst gedeckelt** (Founder-Entscheid
> „schlanker", nicht stillschweigend gefüllt): `m5b_sichtbarkeit_wahrnehmung` ist im Themenbaum
> angelegt, aber in v1.0 ohne eigene Frage (implizit in F-M15-010/014; Grenze Reputation → M-18,
> Kanäle → M-16) — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M15-001 | Positionierungs-Schärfer (Positionierung + Nutzenversprechen + Kernbotschaften herausarbeiten) | 2 | M1/M2; F-M15-001, F-M15-003, F-M15-004 |
| H-M15-002 | Differenzierungs-/Warum-uns-Finder (den einen Grund herausarbeiten, der nicht Preis/Nähe ist) | 2 | M3; F-M15-005, F-M15-006 |
| H-M15-003 | Selbstbild-/Fremdbild-Abgleich (Mandanten-Feedback strukturiert gegen die eigene Positionierung spiegeln) | 3 | M1c; F-M15-010 |
| H-M15-004 | Zielgruppen-Botschafts-Generator (Botschaften pro Wunsch-Zielgruppe/Pain formulieren) | 2 | M4; F-M15-007, F-M15-013 |
| H-M15-005 | Beratungs-Positionierungs-Assistent (von Compliance-Erfüller zu Berater-Wahrnehmung, Botschaften + Belege) | 2 | M4b; F-M15-008, F-M15-011 |
| H-M15-006 | Wettbewerbs-Positionierungs-Analyse (Positionierung relevanter Kanzleien + eigene Lücke/Chance) | 3 | M3c; F-M15-012 |
| H-M15-007 | Auftritts-Konsistenz-Check (Website/Materialien/Kontaktpunkte gegen die Positionierung prüfen) | 2 | M5a; F-M15-014, F-M15-015 |
| H-M15-008 | Positionierungs-Reife-Radar (bewusst geschärft, zukunftsfähig, gelebt, konsistent — Gesamtbild) | 4 | M1–M6; F-M15-006, F-M15-009, F-M15-016 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-15-Output):** Selbst-Diagnose der Positionierung, keine
> Marketing-/Werbeberatung im Einzelfall. Die Ausgabe strukturiert die eigenen Angaben und macht
> Positionierungs-/Botschafts-Lücken sichtbar.

Aus den M-15-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Positionierung schärfen/wählen, Nutzenversprechen
  festlegen, sich als Berater statt Compliance-Erfüller positionieren, eine Spezialisierung nach
  außen tragen, Kernbotschaften definieren).
- `standard` — welche Norm/Routine gilt (z. B. definierte Positionierung + Kernbotschaften,
  konsistenter Außenauftritt über alle Kontaktpunkte, belegte Nutzenversprechen, regelmäßiger
  Positionierungs-Review, intern gelebte Botschaft).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Positionierungs-Statement
  formulieren, Website/Materialien anpassen, Wettbewerbs-Positionierungs-Check machen, Belege/
  Referenzen sammeln, Team auf die Kernbotschaften einschwören).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m15`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
