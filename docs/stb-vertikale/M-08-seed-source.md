# M-08 Seed-Source — Vertriebsstrategie & Zielkunden (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m08` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-08 ist die **Standortbestimmung der
> Vertriebsstrategie** — Zielkunden/Wunschmandate, Vertriebsstrategie & Wachstum,
> Mandantengewinnung, Beratungsverkauf/Cross-Sell, Angebots-Passung, Vertriebssteuerung. Bewusst
> getrennt vom *Erlös-Modell* (M-01), der *Positionierungs-Botschaft* (M-15), den *Lead-Kanälen*
> (M-16) und den *Vertriebs-KPIs* (M-07). Alle Fragen sind offen; die KI-Hebel strukturieren/prüfen.
> Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Vertrieb / Zielkunden Steuerkanzlei (Vertrieb-System; StB-Begründung „Mandanten-Akquise,
> Wunschmandate, Fokus"). Blueprint-Anker: `c1_beratungsverschiebung` **primär** m08 (sekundär
> m15). Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein recyceltes
> exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m08` |
| `version` | `1.0` |
| `name` | M-08 – Vertriebsstrategie & Zielkunden |
| Kategorie | Vertrieb – Unternehmenssystem (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m08` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
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
| Frage-ID (F-M08-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (V1..V6 / Vxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `V` = Vertrieb |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell V1–V6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Vertriebs-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-08-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m08`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| V1 | Zielkunden & Fokus | `v1a_wunschmandate` | Wunschmandats-/Zielkunden-Definition (Branche, Größe, Bedarf) |
| | | `v1b_fokus_vs_alle` | Klarer Vertriebs-Fokus vs. „jedes Mandat nehmen" (Grenze: Spezialisierung als Modell → M-01 b6c) |
| | | `v1c_mandatsannahme_kriterien` | Bewusste Annahme-/Ablehnungskriterien |
| V2 | Vertriebsstrategie & Wachstumsziel | `v2a_wachstumsziel` | Wachstums-/Vertriebsziel (mehr/größer/höherwertig — Grenze: Erlös-Modell → M-01) |
| | | `v2b_strategie_bewusst` | Bewusste Vertriebsstrategie vs. Empfehlung/Zufall |
| | | `v2c_kapazitaet_wachstum` | Vertriebsziel ↔ Kapazität (Grenze: Personalkapazität → M-26) |
| V3 | Mandantengewinnung & Neugeschäft | `v3a_neugeschaeft_quelle` | Woher neue Mandate kommen (Grenze: Kanäle systematisch → M-16) |
| | | `v3b_aktive_akquise` | Aktive Akquise vs. rein passiv |
| | | `v3c_vertriebsprozess` | Prozess Erstkontakt→Mandat (Grenze: CRM/Pipeline-Tool → M-10) |
| V4 | Beratungsverkauf & Cross-/Up-Sell | `v4a_beratungsbedarf_mandanten` | Beratungsbedarf bei Bestandsmandanten erkennen (c1) |
| | | `v4b_wer_beginnt_gespraech` | Wer beginnt das Beratungsgespräch — Sie oder Mandant |
| | | `v4c_cross_up_sell` | Systematischer Cross-/Up-Sell (Grenze: Retention → M-11) |
| V5 | Mandanten-Erwartung & Angebots-Passung | `v5a_erwartung_verstehen` | Erwartung über Compliance hinaus verstehen (c1) |
| | | `v5b_angebot_passung` | Angebot ↔ Erwartung, Lücke (Grenze: Leistungsportfolio-Modell → M-01) |
| | | `v5c_wettbewerb_differenzierung` | Vertriebliche Differenzierung im Gespräch (Grenze: Botschaft → M-15) |
| V6 | Vertriebssteuerung & -reife | `v6a_vertriebssteuerung` | Vertriebsziele/Kennzahlen/Nachverfolgung (Grenze: KPI-System → M-07) |
| | | `v6b_vertriebs_ownership` | Wer ist für Vertrieb verantwortlich (Grenze: Rollen/Governance → M-02/M-03) |
| | | `v6c_neugeschaeft_inhaberabhaengig` | Hängt Neugeschäft ausschließlich am Inhaber (Grenze: → M-42/M-02) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-01/M-02/M-03/M-04/M-06/M-07/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M08-001 | `v1a_wunschmandate` | Haben Sie ein klares Bild Ihres Wunschmandanten — welche Branchen, Größen und Bedarfe zu Ihnen passen — oder nehmen Sie im Grunde jeden, der anfragt? | Ergänzung |
| 2 | F-M08-002 | `v1b_fokus_vs_alle` | Haben Sie einen bewussten Fokus (bestimmte Zielgruppen/Leistungen), auf den Sie Ihren Vertrieb ausrichten — oder ist Ihre Mandantschaft eher bunt zusammengewachsen? | Ergänzung (Grenze: Spezialisierung als Geschäftsmodell-Weichenstellung → M-01 b6c; hier der Vertriebs-Fokus) |
| 3 | F-M08-003 | `v2a_wachstumsziel` | Haben Sie ein konkretes Wachstums-/Vertriebsziel — mehr Mandate, größere, höherwertige — und wissen Sie, in welche Richtung Sie den Bestand entwickeln wollen? | Ergänzung (Grenze: der Erlös-Mix/das Modell dahinter → M-01; hier das Vertriebsziel) |
| 4 | F-M08-004 | `v2b_strategie_bewusst` | Gewinnen Sie neue Mandate über eine bewusste Vertriebsstrategie — oder kommt Neugeschäft im Wesentlichen über Empfehlung und Zufall, ohne dass Sie es aktiv steuern? | Ergänzung |
| 5 | F-M08-005 | `v3a_neugeschaeft_quelle` | Woher kommen Ihre neuen Mandate heute überwiegend (Empfehlung, Bestand, aktive Akquise, Online, Zufall) — und wie verlässlich ist diese Quelle für Ihr Wachstum? | Ergänzung (Grenze: die systematischen Kanäle/Lead-Beschaffung → M-16; hier die Vertriebs-Quelle strategisch) |
| 6 | F-M08-006 | `v3b_aktive_akquise` | Betreiben Sie überhaupt aktive Akquise (gezielt auf Wunschmandate zugehen) — oder ist Ihr Vertrieb rein passiv, Sie warten, bis jemand anfragt? | Ergänzung |
| 7 | F-M08-007 | `v4a_beratungsbedarf_mandanten` | Erkennen Sie bei Ihren Bestandsmandanten aktiv, wo betriebswirtschaftlicher Beratungsbedarf besteht — oder bleibt es bei der Pflicht-Compliance, weil niemand systematisch danach schaut? | Ergänzung (Grenze: der Erlös-Mix-Verschiebungs-*Entscheid* → M-01 b2c; hier die vertriebliche Bedarfserkennung) |
| 8 | F-M08-008 | `v4b_wer_beginnt_gespraech` | Bei welchem Anteil Ihrer Mandanten sprechen Sie aktiv über betriebswirtschaftliche Themen statt nur Pflicht-Compliance — und wer beginnt dieses Gespräch, Sie oder der Mandant? | Variante von F-BP-018 (c1-Diagnose, primäres Zielmodul m08; hier operativ vertieft als Vertriebschance) |
| 9 | F-M08-009 | `v5a_erwartung_verstehen` | Was erwarten Ihre Mandanten heute von Ihnen, das über die reine Steuer-/Compliance-Pflicht hinausgeht — und wie gut können Sie diese Erwartung aktuell bedienen? | Variante von F-BP-007 (c1-Diagnose, primäres Zielmodul m08; hier operativ vertieft; Grenze: das Angebots-Modell dahinter → M-01) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M08-010 | `v1c_mandatsannahme_kriterien` | Haben Sie Kriterien, nach denen Sie Mandate bewusst annehmen oder ablehnen — oder sagen Sie faktisch zu allem ja, auch zu Mandaten, die schlecht passen oder sich nicht rechnen? | Ergänzung (Grenze: die Rentabilität je Mandat → M-01 b3b; hier das Vertriebs-/Annahmekriterium) |
| 11 | F-M08-011 | `v2c_kapazitaet_wachstum` | Passt Ihr Wachstums-/Vertriebsziel zu Ihrer Kapazität — könnten Sie neue Mandate überhaupt bedienen, oder müssten Sie eher bremsen, weil das Team schon voll ist? | Ergänzung (Grenze: Personalkapazität/Auslastung → M-26, strukturelle Wachstumstauglichkeit → M-02; hier die Vertriebs-Realisierbarkeit) |
| 12 | F-M08-012 | `v3c_vertriebsprozess` | Gibt es bei Ihnen einen strukturierten Weg vom Erstkontakt bis zum unterschriebenen Mandat (Erstgespräch, Angebot, Nachfassen) — oder läuft jeder Neukontakt individuell und ohne roten Faden? | Ergänzung (Grenze: CRM-/Pipeline-Tooling → M-10, nicht im Cut; hier der Vertriebsprozess) |
| 13 | F-M08-013 | `v4c_cross_up_sell` | Verkaufen Sie systematisch zusätzliche Leistungen an Bestandsmandanten (Cross-/Up-Sell) — oder bleibt viel Potenzial liegen, weil das Mehr-Anbieten niemand aktiv macht? | Ergänzung (Grenze: Bestandsentwicklung/Retention → M-11, nicht im Cut; hier der aktive Mehrverkauf) |
| 14 | F-M08-014 | `v5b_angebot_passung` | Passt Ihr heutiges Leistungsangebot zu dem, was Ihre (Wunsch-)Mandanten erwarten — oder gibt es eine Lücke zwischen dem, was Sie anbieten, und dem, was gefragt ist? | Ergänzung (Grenze: das Leistungsportfolio als Modell → M-01 b1a; hier die Vertriebs-Passung Angebot↔Nachfrage) |
| 15 | F-M08-015 | `v5c_wettbewerb_differenzierung` | Wenn ein Wunschmandant Sie mit anderen Kanzleien vergleicht — wissen Sie, warum er sich für Sie entscheidet, und bringen Sie diesen Grund im Vertriebsgespräch aktiv rüber? | Ergänzung (Grenze: die Positionierungs-*Botschaft*/Außenkommunikation → M-15 c2 F-BP-008; hier die vertriebliche Differenzierung im Gespräch) |
| 16 | F-M08-016 | `v6a_vertriebssteuerung` | Steuern Sie Ihren Vertrieb mit Zielen und Kennzahlen (Neumandate, Angebotsquote, Beratungsumsatz) — oder machen Sie Vertrieb rein nach Gefühl, ohne zu messen, was funktioniert? | Ergänzung (Grenze: das KPI-System insgesamt → M-07; hier die Vertriebs-Steuerung) |
| 17 | F-M08-017 | `v6c_neugeschaeft_inhaberabhaengig` | Hängt Ihr Neugeschäft ausschließlich an Ihnen als Inhaber — kämen ohne Sie kaum neue Mandate rein — oder gibt es weitere Personen/Wege, über die Vertrieb passiert? | Ergänzung (Grenze: Inhaberabhängigkeit strukturell → M-02, als Haltung → M-42; hier die vertriebliche Abhängigkeit) |

> **Auto-Dedup-Befund:** M-08 (Vertriebsstrategie & Zielkunden) ist gegenüber dem Korpus
> weitgehend frisch — **15 Ergänzungen, 2 Varianten**. Beide Varianten liegen auf dem
> Mandanten-Erwartungs-/Beratungsverschiebungs-Anker (`c1_beratungsverschiebung`), dessen
> *primäres* Zielmodul m08 ist: **F-M08-008 ↔ F-BP-018** (wer beginnt das BWL-Gespräch) und
> **F-M08-009 ↔ F-BP-007** (Mandanten-Erwartung über Compliance hinaus). Der Blueprint
> diagnostiziert die Beratungsverschiebung; M-08 vertieft sie als *Vertriebschance*. Grenzen
> sauber gezogen: **M-01** (Erlös-*Modell*/Portfolio/Rentabilität — M-08 = Vertriebs-Ausführung),
> **M-15** (Positionierungs-*Botschaft*, c2 primär m15, F-BP-008 — M-08 = Zielkunden +
> Vertriebsgespräch), **M-16** (Lead-*Kanäle* — M-08 = Vertriebs-Strategie/Quelle), **M-07**
> (Vertriebs-*KPIs*), **M-26/M-02** (Kapazität/Struktur), **M-42** (Inhaberabhängigkeit als
> Haltung), **M-10/M-11** (CRM-Pipeline/Retention — nicht im Cut). **Bewusst gedeckelt**
> (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt): `v6b_vertriebs_ownership` ist im
> Themenbaum angelegt, aber in v1.0 ohne eigene Frage (implizit in F-M08-017; Grenze Rollen → M-02)
> — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M08-001 | Wunschmandanten-/Zielkunden-Profil (ideales Mandantenprofil schärfen: Branche, Größe, Bedarf, Passung) | 2 | V1; F-M08-001, F-M08-002, F-M08-010 |
| H-M08-002 | Vertriebsstrategie-/Wachstums-Planer (Wachstumsziel + Weg + Kapazitätsabgleich) | 2 | V2; F-M08-003, F-M08-004, F-M08-011 |
| H-M08-003 | Akquise-/Neugeschäfts-Quellen-Analyse (woher Mandate kommen, wie verlässlich, wo aktiv werden) | 2 | V3; F-M08-005, F-M08-006 (Grenze: Kanal-Tooling → M-16) |
| H-M08-004 | Beratungsbedarf-Radar Bestandsmandanten (aus Mandantendaten Beratungs-/Cross-Sell-Chancen erkennen) | 3 | V4; F-M08-007, F-M08-013 |
| H-M08-005 | Beratungsgespräch-/Cross-Sell-Assistent (Gesprächsleitfaden, wann welche Beratung ansprechen) | 2 | V4b; F-M08-008 |
| H-M08-006 | Angebots-/Passungs-Check (Angebot vs. Mandanten-Erwartung, Lücken sichtbar) | 2 | V5; F-M08-009, F-M08-014 |
| H-M08-007 | Vertriebsprozess-/Pipeline-Struktur (Erstkontakt→Mandat strukturieren, Nachfass-Erinnerung) | 3 | V3c; F-M08-012 |
| H-M08-008 | Vertriebs-Reife-Radar (läuft Neugeschäft systematisch, gesteuert & inhaberunabhängig — Gesamtbild Vertriebsreife) | 4 | V6; F-M08-016, F-M08-017 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-08-Output):** Selbst-Diagnose der Vertriebsstrategie, keine
> Marketing-/Vertriebsberatung im Einzelfall. Die Ausgabe strukturiert die eigenen Angaben und
> macht Vertriebs-/Wachstums-Hebel sichtbar.

Aus den M-08-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Wunschmandanten-Fokus festlegen, Wachstumsziel
  wählen, aktive Akquise starten vs. bei Empfehlung bleiben, Beratungsverkauf systematisch aufbauen,
  Mandats-Annahmekriterien einführen).
- `standard` — welche Norm/Routine gilt (z. B. definiertes Zielkundenprofil, bewusste
  Vertriebsstrategie mit Ziel, strukturierter Vertriebsprozess Erstkontakt→Mandat, regelmäßige
  Beratungsbedarf-Sichtung im Bestand, Vertriebs-Kennzahlen mit Nachverfolgung).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Wunschmandanten-Profil erstellen,
  Vertriebsprozess dokumentieren, Cross-Sell-Aktion für ein Segment starten, Annahmekriterien
  festlegen, Vertriebs-Kennzahlen aufsetzen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m08`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
