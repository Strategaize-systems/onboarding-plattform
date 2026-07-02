# M-16 Seed-Source — Leadgenerierung & Kanäle (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m16` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-02 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-16 ist die **Standortbestimmung der
> Leadgenerierung** — Lead-Quellen/Kanal-Mix, Systematik, digitale Sichtbarkeit, Empfehlungs-/
> Netzwerk-Systematik, Lead-Handling, Kanal-Steuerung. Bewusst getrennt von der *Botschaft/
> Positionierung* (M-15), der *Vertriebsstrategie/Zielkunden* (M-08), *Social/Content* (M-17) und
> *CRM/Pipeline* (M-10). Alle Fragen sind offen; die KI-Hebel strukturieren/prüfen. Dieser
> Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-02 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Leadgenerierung / Kanäle Steuerkanzlei (Marketing; xlsx-Kurzbeschreibung „Woher Anfragen kommen
> (Website, Empfehlungen, Messen, Partner, In-/Outbound) und wie systematisch das läuft").
> Blueprint-Anker: `c2_positionierung` **sekundär** m16 (primär m15). Tiefen-/Format-Maßstab +
> Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-15/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`. Kein
> recyceltes exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m16` |
| `version` | `1.0` |
| `name` | M-16 – Leadgenerierung & Kanäle |
| Kategorie | Marketing & Leadgenerierung (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m16` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
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
| Frage-ID (F-M16-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (W1..W6 / Wxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `W` = Wege/Kanäle (M-16-modul-scoped) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell W1–W6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Leadgen-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-16-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m16`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| W1 | Lead-Quellen & Kanal-Mix | `w1a_kanal_mix` | Welche Kanäle Anfragen liefern (Grenze: strateg. Vertriebs-Quelle → M-08 V3a) |
| | | `w1b_empfehlungs_abhaengigkeit` | Abhängigkeit von Empfehlung/Mundpropaganda vs. aktive Kanäle |
| | | `w1c_kanal_wirksamkeit` | Welcher Kanal die besten/passendsten Leads bringt |
| W2 | Systematik & Aktivität | `w2a_systematik` | Systematische Leadgenerierung vs. Zufall/passiv |
| | | `w2b_inbound_outbound` | Inbound vs. Outbound (Grenze: Akquise-Aktivität → M-08 V3b) |
| | | `w2c_kontinuitaet` | Kontinuierlich vs. nur bei sinkender Auslastung |
| W3 | Digitale Sichtbarkeit & Website | `w3a_website_lead` | Website als aktiver Lead-Kanal (Grenze: Botschaft → M-15) |
| | | `w3b_auffindbarkeit` | Online-Auffindbarkeit (Google/lokal) für Wunschmandate |
| | | `w3c_digitale_praesenz` | Digitale Präsenz gesamt (Grenze: Social/Content → M-17) |
| W4 | Empfehlungs- & Netzwerk-Systematik | `w4a_empfehlung_aktiv` | Aktiv um Empfehlungen bitten vs. passiv hoffen |
| | | `w4b_multiplikatoren_partner` | Multiplikatoren/Kooperationen (Banken, Berater, Verbände, Kammern) |
| | | `w4c_netzwerk_pflege` | Netzwerk/Bestand als Lead-Quelle (Grenze: Cross-Sell → M-08 V4c) |
| W5 | Lead-Handling & Conversion | `w5a_reaktion_geschwindigkeit` | Reaktionsgeschwindigkeit/-verlässlichkeit auf Anfragen |
| | | `w5b_lead_nachverfolgung` | Lead-Nachverfolgung (Grenze: CRM/Pipeline → M-10, Abschluss → M-08 V3c) |
| | | `w5c_lead_qualitaet_filter` | Passen reinkommende Leads zum Wunschmandat (Fit) |
| W6 | Kanal-Steuerung & -Reife | `w6a_messung_steuerung` | Leadquellen/Conversion gemessen (Grenze: KPI → M-07, Vertriebssteuerung → M-08 V6a) |
| | | `w6b_kanal_ownership` | Wer verantwortet Leadgen/Marketing (Grenze: Rollen → M-02) |
| | | `w6c_zukunft_kanaele` | Anpassung an neue/digitale Kanäle (Grenze: Social/Content → M-17) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-15/M-BP/M-26/M-27/M-28/M-35/M-42-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M16-001 | `w1a_kanal_mix` | Über welche Kanäle kommen Ihre Anfragen heute konkret rein (Empfehlung, Website, Google, Messen/Events, Partner/Multiplikatoren, aktive Ansprache) — und wie verteilt sich das ungefähr? | Variante von F-M08-005 (M-08: die Neugeschäfts-Quelle strategisch; hier der granulare Kanal-Mix — M-08 V3a defert die Kanäle explizit hierher) |
| 2 | F-M16-002 | `w1b_empfehlungs_abhaengigkeit` | Wie stark hängt Ihr Neugeschäft an Empfehlung und Mundpropaganda — und was würde passieren, wenn dieser Strom versiegt, weil z. B. ältere Stammmandanten wegfallen? | Ergänzung |
| 3 | F-M16-003 | `w2a_systematik` | Läuft Ihre Mandantengewinnung systematisch (planbare, wiederkehrende Kanäle) — oder kommt Neugeschäft eher zufällig, ohne dass Sie steuern könnten, wie viel reinkommt? | Ergänzung |
| 4 | F-M16-004 | `w2b_inbound_outbound` | Gewinnen Sie Mandate eher inbound (Interessenten kommen zu Ihnen) oder outbound (Sie gehen aktiv auf Zielmandate zu) — und welche Richtung funktioniert bei Ihnen überhaupt? | Ergänzung (Grenze: aktive Akquise als Vertriebs-Aktivität → M-08 V3b; hier der Kanal-Charakter) |
| 5 | F-M16-005 | `w3a_website_lead` | Ist Ihre Website ein aktiver Lead-Kanal (Interessenten finden Sie und melden sich) — oder eher eine digitale Visitenkarte, über die faktisch nichts reinkommt? | Ergänzung (Grenze: die Botschaft/Positionierung der Website → M-15; hier die Lead-Funktion) |
| 6 | F-M16-006 | `w4a_empfehlung_aktiv` | Bitten Sie aktiv und systematisch um Empfehlungen (bei zufriedenen Mandanten, in passenden Momenten) — oder hoffen Sie eher passiv darauf, dass Empfehlungen von selbst kommen? | Ergänzung |
| 7 | F-M16-007 | `w5a_reaktion_geschwindigkeit` | Wie schnell und verlässlich reagieren Sie auf eine neue Anfrage — meldet sich jemand innerhalb eines Tages verbindlich, oder bleiben Anfragen auch mal liegen? | Ergänzung |
| 8 | F-M16-008 | `w5b_lead_nachverfolgung` | Werden Interessenten, die nicht sofort Mandant werden, systematisch nachverfolgt — oder versanden solche Kontakte, weil sich niemand mehr meldet? | Ergänzung (Grenze: CRM/Pipeline-Tooling → M-10 nicht im Cut, Vertriebs-Abschluss → M-08 V3c; hier das Lead-Nachfassen) |
| 9 | F-M16-009 | `w6a_messung_steuerung` | Wissen Sie, welcher Kanal Ihnen wie viele und welche Mandate bringt — messen Sie die Herkunft Ihrer Anfragen — oder ist das reines Bauchgefühl? | Ergänzung (Grenze: das KPI-System → M-07, Vertriebssteuerung → M-08 V6a; hier die Kanal-Messung) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M16-010 | `w1c_kanal_wirksamkeit` | Welcher Ihrer Kanäle bringt die besten Mandate (passend, rentabel) — und stecken Sie Ihre Energie in die wirksamen Kanäle oder gießen Sie mit der Kanne? | Ergänzung |
| 11 | F-M16-011 | `w2c_kontinuitaet` | Betreiben Sie Leadgenerierung kontinuierlich — oder erst dann, wenn die Auslastung sinkt und dann hektisch (Feuerwehr-Modus)? | Ergänzung |
| 12 | F-M16-012 | `w3b_auffindbarkeit` | Sind Sie online auffindbar, wenn ein Wunschmandant in Ihrer Region nach einer Kanzlei/Ihrem Spezialthema sucht — oder taucht der Wettbewerb auf und Sie nicht? | Ergänzung |
| 13 | F-M16-013 | `w3c_digitale_praesenz` | Wie ist Ihre digitale Präsenz insgesamt aufgestellt (Website, Einträge, Bewertungen, ggf. Fachbeiträge) — passend für eine Kanzlei, die in 5 Jahren noch Mandate gewinnen will? | Ergänzung (Grenze: Social-Media-/Content-Strategie & -Erstellung → M-17, Reputation/Bewertungsmanagement → M-18, nicht im Cut; hier die digitale Lead-Präsenz) |
| 14 | F-M16-014 | `w4b_multiplikatoren_partner` | Nutzen Sie Multiplikatoren und Kooperationen als Lead-Quelle (Banken, Unternehmensberater, Rechtsanwälte, Verbände, Kammern) — oder ist dieses Netzwerk-Potenzial ungenutzt? | Ergänzung |
| 15 | F-M16-015 | `w4c_netzwerk_pflege` | Pflegen Sie Ihr bestehendes Netzwerk und Ihre Mandantenbasis gezielt als Quelle für Weiterempfehlungen und Zusatzmandate — oder passiert das, wenn überhaupt, nur nebenbei? | Ergänzung (Grenze: Cross-/Up-Sell an Bestand → M-08 V4c; hier das Netzwerk als Lead-Quelle) |
| 16 | F-M16-016 | `w5c_lead_qualitaet_filter` | Passen die Anfragen, die reinkommen, überhaupt zu Ihren Wunschmandaten — oder ziehen Ihre Kanäle vor allem Leads an, die Sie eigentlich nicht wollen? | Ergänzung (Grenze: die Wunschmandats-Definition/Annahmekriterien → M-08 V1/V1c; hier der kanal-seitige Lead-Fit) |
| 17 | F-M16-017 | `w6b_kanal_ownership` | Gibt es bei Ihnen jemanden, der für Leadgenerierung/Marketing verantwortlich ist (Zeit, Budget, Zuständigkeit) — oder macht das der Inhaber nebenbei, wenn mal Luft ist? | Ergänzung (Grenze: Rollen/Governance → M-02; analog Recruiting-Ownership → M-27 F-M27-023; hier das Marketing-/Lead-Ownership) |

> **Auto-Dedup-Befund:** M-16 (Leadgenerierung & Kanäle) ist gegenüber dem Korpus weitgehend
> frisch — **16 Ergänzungen, 1 Variante**. Die Variante **F-M16-001 ↔ F-M08-005** liegt auf der
> Neugeschäfts-Quelle: M-08 fragt sie *strategisch* (woher Mandate, wie verlässlich) und defert die
> Kanäle explizit hierher; M-16 vertieft den *granularen Kanal-Mix*. Grenzen sauber gezogen:
> **M-15** (Positionierungs-*Botschaft* — M-16 = die Kanäle/Verteilung), **M-08** (Vertriebsstrategie/
> Zielkunden + Akquise-*Aktivität* + Vertriebs-Abschluss — M-16 = Kanal-Mix + Lead-Handling),
> **M-17/M-18** (Social/Content-Strategie, Reputation — nicht im Cut), **M-10** (CRM/Pipeline —
> nicht im Cut), **M-07** (Kanal-/Vertriebs-KPI), **M-02** (Rollen/Ownership). **Bewusst gedeckelt**
> (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt): `w6c_zukunft_kanaele` ist im
> Themenbaum angelegt, aber in v1.0 ohne eigene Frage (implizit in F-M16-013; Grenze Social → M-17)
> — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M16-001 | Kanal-Mix-/Lead-Quellen-Analyse (welche Kanäle wie viele/welche Mandate bringen, Herkunft sichtbar) | 2 | W1/W6a; F-M16-001, F-M16-009, F-M16-010 |
| H-M16-002 | Leadgen-Systematik-Planer (planbare, wiederkehrende Kanäle statt Zufall/Feuerwehr) | 2 | W2; F-M16-003, F-M16-011 |
| H-M16-003 | Website-/Auffindbarkeits-Check (Website als Lead-Kanal + lokale/thematische Sichtbarkeit) | 2 | W3; F-M16-005, F-M16-012 |
| H-M16-004 | Empfehlungs-/Netzwerk-Aktivierung (systematisch Empfehlungen anstoßen, Multiplikatoren-Landkarte) | 2 | W4; F-M16-006, F-M16-014, F-M16-015 |
| H-M16-005 | Lead-Reaktions-/Nachfass-Assistent (schnelle, verlässliche Reaktion + Nachverfolgung offener Kontakte) | 3 | W5; F-M16-007, F-M16-008 |
| H-M16-006 | Lead-Fit-Filter (Anfragen gegen Wunschmandat-Profil prüfen, Fehl-Leads erkennen) | 3 | W5c; F-M16-016 |
| H-M16-007 | Digitale-Präsenz-Radar (Website/Einträge/Sichtbarkeit für die Zukunft der Mandatsgewinnung) | 2 | W3c; F-M16-013 (Grenze: Content/Social → M-17) |
| H-M16-008 | Leadgen-Reife-Radar (systematisch, gemessen, verantwortet, zukunftsfähig — Gesamtbild) | 4 | W1–W6; F-M16-003, F-M16-009, F-M16-017 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-16-Output):** Selbst-Diagnose der Leadgenerierung, keine
> Marketing-/Agentur-Beratung im Einzelfall. Die Ausgabe strukturiert die eigenen Angaben und macht
> Kanal-/Lead-Hebel sichtbar.

Aus den M-16-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Empfehlungs-Abhängigkeit reduzieren, einen aktiven
  Kanal aufbauen, Website zum Lead-Kanal machen, Multiplikatoren-Netzwerk erschließen, ein
  Lead-Handling-Standard einführen).
- `standard` — welche Norm/Routine gilt (z. B. planbarer Kanal-Mix, kontinuierliche Leadgenerierung,
  definierte Reaktions-/Nachfass-Regel, gemessene Lead-Herkunft, Marketing-/Lead-Ownership).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Kanal-Herkunft messen, Website-Lead-
  Funktion aufsetzen, Empfehlungs-Ask systematisieren, Multiplikatoren-Liste erstellen, Lead-Nachfass-
  Prozess definieren).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m16`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
