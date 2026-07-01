# M-27 Seed-Source — Rekrutierung & Employer Branding (SLC-170b, Welle 4)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m27` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-01 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **IP-Quelle:** Founder-Autoring 2026-07-01 (Themenbaum + MUST/NICE + Azubi-Kern + Vergütung-als-
> Recruiting-Hebel Founder-bestätigt); Domänen-Struktur Rekrutierung/Employer Branding Steuerkanzlei
> (HR & Personal, Beschaffungs-/Attraktivitätsseite des Personalmangels). Tiefen-/Format-Maßstab +
> Auto-Dedup-Korpus: `M-04/M-06/M-BP/M-26-seed-source.md`. Kein recyceltes exit_readiness-Material (DEC-234).
> Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
> **24 Fragen (11 Kern / 13 Workspace) · 11 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m27` |
| `version` | `1.0` |
| `name` | M-27 – Rekrutierung & Employer Branding |
| Kategorie | HR & Personal (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m27` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 24 (11 Kern / 13 Workspace) |
| KI-Hebel | 11 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum `exit_readiness`-, M-04-, M-06- und M-26-Seed
(MIG-029 / MIG-125). Die zwei Stufen werden auf zwei Blocks abgebildet; die Modul-Spec-Spalte
„Ebene" (Kern/Workspace) landet zusätzlich pro Frage in `question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M27-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → Block `stufe1_kern`; Workspace → Block `stufe2_vertiefung` |
| Unterbereich (R1..R6 / Rxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | M-27 hat ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell R1–R6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-27-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später, wie M-04/M-06/M-26).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m27`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| R1 | Arbeitgeber-Positionierung & -Marke (EVP) | `r1a_evp` | Arbeitgeber-Nutzenversprechen & Wunsch-Mitarbeiter-Profil |
| | | `r1b_arbeitgeber_sichtbarkeit` | Sichtbarkeit als Arbeitgeber (Karriere-Web, kununu/Google-Bewertungen, Social) |
| | | `r1c_kultur_flexibilitaet` | Kultur & Flexibilität (Homeoffice/Teilzeit/Digitalisierungsgrad als Argument) |
| R2 | Rekrutierungs-Prozess & Kanäle | `r2a_kanaele` | Rekrutierungs-Kanäle (Portale, Empfehlung, Hochschule, Social Recruiting, Personalberatung) |
| | | `r2b_prozess_geschwindigkeit` | Bewerbungsprozess & Time-to-Hire / Reaktionsgeschwindigkeit |
| | | `r2c_auswahl` | Auswahl-/Eignungsverfahren (Kriterien, Probearbeit, wer entscheidet) |
| R3 | Nachwuchs & Ausbildung (Azubi-Pipeline) | `r3a_azubi_gewinnung` | Azubi-/Nachwuchsgewinnung (Schulen, Praktika, dual) |
| | | `r3b_uebernahme_bindung` | Übernahme nach Ausbildung / frühe Bindung |
| R4 | Candidate Experience & Bewerber-Funnel | `r4a_bewerbererlebnis` | Bewerbererlebnis (Erreichbarkeit, Wertschätzung, Absage-Handling) |
| | | `r4b_funnel_conversion` | Funnel-Transparenz (Bewerbungen → Einstellungen, wo bricht es) |
| R5 | Attraktivitäts-Hebel (Vergütung, Benefits, Perspektive) | `r5a_verguetung_benefits` | Vergütungs-/Benefit-Attraktivität im Marktvergleich |
| | | `r5b_entwicklung_perspektive` | Entwicklungs-/Aufstiegsperspektive als Recruiting-Argument |
| R6 | Rekrutierungs-Strategie & Wirksamkeit | `r6a_strategie_planung` | Strategie vs. Reaktion (an Personalbedarf M-26 gekoppelt) + Zuständigkeit |
| | | `r6b_wirksamkeit_kosten` | Wirksamkeit/Kosten je Einstellung (was funktioniert, was verbrennt Geld) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04/M-06/M-BP/M-26-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 11 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M27-001 | `r1a_evp` | Wenn ein guter Bewerber fragt „warum sollte ich ausgerechnet zu Ihnen kommen und nicht zur Kanzlei nebenan?" — was ist Ihre ehrliche Antwort, und wissen Ihre Mitarbeiter das auch? | Ergänzung |
| 2 | F-M27-002 | `r1a_evp` | Haben Sie ein bewusstes Bild davon, welcher Typ Mitarbeiter zu Ihnen passt (Wunschprofil) — oder nehmen Sie faktisch, wer sich bewirbt? | Ergänzung |
| 3 | F-M27-003 | `r1b_arbeitgeber_sichtbarkeit` | Wie sichtbar sind Sie als Arbeitgeber (Karriere-Seite, Bewertungen auf kununu/Google, Präsenz dort, wo Ihre Zielbewerber suchen) — und wann haben Sie das zuletzt aus Bewerbersicht angeschaut? | Ergänzung |
| 4 | F-M27-004 | `r2a_kanaele` | Über welche Kanäle gewinnen Sie heute tatsächlich Ihre Mitarbeiter (Portale, Empfehlung, Ausbildung, Personalberatung, Zufall) — und welcher bringt die besten Leute? | Ergänzung |
| 5 | F-M27-005 | `r2a_kanaele` | Wie stark nutzen Sie Ihr bestehendes Team zur Gewinnung (Mitarbeiter-werben-Mitarbeiter, Netzwerk) — und ist das bei Ihnen ein System oder Zufall? | Ergänzung |
| 6 | F-M27-006 | `r2b_prozess_geschwindigkeit` | Wie schnell reagieren Sie auf eine Bewerbung, und wie lange dauert der Weg von Bewerbung bis Vertrag — verlieren Sie Kandidaten, weil andere schneller sind? | Ergänzung |
| 7 | F-M27-007 | `r3a_azubi_gewinnung` | Bilden Sie systematisch aus, und woher kommen Ihre Azubis (Schulen, Praktika, Empfehlung) — oder ist die Nachwuchsgewinnung dem Zufall überlassen? | Ergänzung |
| 8 | F-M27-008 | `r3a_azubi_gewinnung` | Wie leicht oder schwer fällt es Ihnen aktuell, überhaupt geeignete Azubis/Nachwuchs zu finden — und wie hat sich das in den letzten Jahren verändert? | Ergänzung |
| 9 | F-M27-009 | `r5a_verguetung_benefits` | Wissen Sie, wie Ihre Vergütung und Benefits im Vergleich zu konkurrierenden Kanzleien/Arbeitgebern in Ihrer Region liegen — und ist das eher Stärke oder Schwäche im Wettbewerb um Leute? | Ergänzung |
| 10 | F-M27-010 | `r6a_strategie_planung` | Rekrutieren Sie vorausschauend/kontinuierlich (auch ohne akute Vakanz, an Ihren Personalbedarf gekoppelt) — oder erst, wenn eine Stelle akut brennt? | Ergänzung (Grenze: Bedarfsseite „wie viele/welche" → M-26 P5a; hier die Beschaffungs-Steuerung) |
| 11 | F-M27-011 | `r4b_funnel_conversion` | Wie viele Stellen haben Sie in den letzten 12 Monaten gesucht, und wie viele davon konnten Sie tatsächlich besetzen? | Variante von F-BP-005 (M-BP: Stellen-Gap → Mandatsablehnung. Mandatsablehnung-Hälfte = M-26 F-M26-005; hier die Beschaffungs-/Besetzungs-Hälfte) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 13 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 12 | F-M27-012 | `r1c_kultur_flexibilitaet` | Welche Flexibilität bieten Sie (Homeoffice, Teilzeit, Vertrauensarbeitszeit, digitales Arbeiten) — und ist Ihr Digitalisierungsgrad eher ein Argument für oder gegen Sie im Werben um Fachkräfte? | Ergänzung (Grenze: Digitalisierung als System → M-36; hier als Arbeitgeber-Argument) |
| 13 | F-M27-013 | `r1c_kultur_flexibilitaet` | Wie würden Ihre eigenen Mitarbeiter Ihre Kanzlei als Arbeitgeber beschreiben, wenn sie ehrlich mit einem Bekannten sprechen — und wissen Sie das? | Ergänzung |
| 14 | F-M27-014 | `r2c_auswahl` | Nach welchen Kriterien wählen Sie aus (Fachlichkeit, Persönlichkeit, Kulturfit), gibt es Probearbeit/ein strukturiertes Verfahren — und wer trifft die Einstellungsentscheidung? | Ergänzung |
| 15 | F-M27-015 | `r4a_bewerbererlebnis` | Wie erleben Bewerber den Kontakt mit Ihnen — schnelle Rückmeldung, wertschätzende Absagen — und haben Sie das je aus deren Sicht getestet? | Ergänzung |
| 16 | F-M27-016 | `r4b_funnel_conversion` | Haben Sie Transparenz über Ihren Bewerber-Funnel (Bewerbungen → Gespräche → Zusagen → Eintritte) und wissen Sie, an welcher Stelle Sie Kandidaten verlieren? | Ergänzung |
| 17 | F-M27-017 | `r3b_uebernahme_bindung` | Wie viele Ihrer Azubis übernehmen Sie nach der Ausbildung, wie viele bleiben langfristig — und tun Sie während der Ausbildung gezielt etwas für die Bindung? | Ergänzung (Grenze: Einarbeitung/Onboarding → M-28) |
| 18 | F-M27-018 | `r5a_verguetung_benefits` | Welche Benefits jenseits des Gehalts setzen Sie ein (bezahlte Weiterbildung, Fahrtkosten/JobRad, Gesundheit, Events) — und welche davon ziehen bei Ihren Zielbewerbern tatsächlich? | Ergänzung |
| 19 | F-M27-019 | `r5b_entwicklung_perspektive` | Können Sie Bewerbern eine konkrete Entwicklungs-/Aufstiegsperspektive aufzeigen (Weiterbildung, Verantwortung, Richtung Berufsträger/Partner) — und nutzen Sie das aktiv im Recruiting? | Ergänzung (Grenze: der tatsächliche Qualifizierungspfad → M-26 P4b; hier das Argument nach außen) |
| 20 | F-M27-020 | `r6b_wirksamkeit_kosten` | Wissen Sie, was Sie eine Einstellung kostet (Anzeigen, Personalberatung, Zeit) und welcher Kanal sich rechnet — oder geben Sie eher ungezielt Geld aus? | Ergänzung |
| 21 | F-M27-021 | `r1b_arbeitgeber_sichtbarkeit` | Wie aktiv pflegen Sie Ihre Arbeitgeber-Bewertungen (kununu/Google) und reagieren auf negative Bewertungen — oder überlassen Sie Ihr Arbeitgeber-Bild dem Zufall? | Ergänzung (Grenze: Mandanten-Reputationsmanagement M-18 nicht im Cut; hier Arbeitgeber-Reputation) |
| 22 | F-M27-022 | `r2a_kanaele` | Nutzen Sie moderne Beschaffungswege (Social Recruiting, aktive Ansprache auf Plattformen, KI-gestützte Kampagnen) — oder verlassen Sie sich auf die klassische Stellenanzeige und Warten? | Ergänzung |
| 23 | F-M27-023 | `r6a_strategie_planung` | Gibt es bei Ihnen jemanden, der für Recruiting/Employer Branding verantwortlich ist (Zeit, Budget, Zuständigkeit) — oder macht das der Inhaber nebenbei? | Ergänzung (Grenze: Rollen/Governance → M-02/M-03; hier Recruiting-Ownership) |
| 24 | F-M27-024 | `r1a_evp` | Wenn Ihr bester Mitarbeiter morgen ein Angebot einer anderen Kanzlei mit 15 % mehr Gehalt bekäme — würde er bleiben, und woran genau würde das liegen? | Ergänzung (scharfe Aha-Frage; Grenze: strukturelle Schlüsselkraft-Bindung → M-26 P2b, hier Arbeitgeberattraktivität) |

> **Auto-Dedup-Befund:** M-27 (Beschaffungs-/Attraktivitätsseite) ist gegenüber Finanz-Korpus
> (M-04/M-06) völlig frisch — 23 der 24 Fragen sind **Ergänzungen**. Die **eine Variante**
> (F-M27-011) ist die **Beschaffungs-Hälfte von F-BP-005** (M-BP-Personalengpass): der Blueprint
> fragt „Stellen gesucht/besetzt → Mandate abgelehnt". Diese Doppel-Frage ist bewusst über das
> HR-Trio geteilt — **Mandatsablehnung** = M-26 (F-M26-005, Kapazität), **Stellen gesucht/besetzt**
> = M-27 (F-M27-011, Beschaffung). Sauberer Trio-Schnitt: **M-26** hält Bedarf/Struktur (*wie
> viele/welche*), **M-27** hält Beschaffung/Attraktivität (*wie gewinne ich sie*), **M-28** hält
> Onboarding/Einarbeitung (*wie werden sie produktiv*, bewusst ausgespart). Grenzen zu M-26 P2b
> (strukturelle Bindung), M-26 P4b (Qualifizierungspfad), M-36 (Digitalisierung als System) und
> M-18 (Mandanten-Reputation, nicht im Cut) sind je Frage in der Provenienz vermerkt. DEC-234
> gewahrt — kein exit_readiness-Recycling.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M27-001 | Arbeitgeber-Profil / EVP-Baukasten (Nutzenversprechen + Wunschprofil schärfen) | 1 | R1a; F-M27-001, F-M27-002 |
| H-M27-002 | Stellenanzeigen-/Karriereseiten-Generator (zielgruppengerechte, bewerber-sichtbare Texte) | 2 | R1b/R2a; F-M27-003, F-M27-004 |
| H-M27-003 | Arbeitgeber-Bewertungs-Monitor (kununu/Google — Alerts + Antwort-Vorschläge) | 2 | R1b; F-M27-003, F-M27-021 |
| H-M27-004 | Multi-Channel-Ausschreibung & Kanal-Verteilung (ein Vorgang auf mehrere Portale/Social) | 2 | R2a; F-M27-004, F-M27-022 |
| H-M27-005 | Bewerber-Funnel-/ATS-Tracking (Bewerbungen → Stufen → Zeit, Abbruch sichtbar) | 3 | R4b/R2b; F-M27-011, F-M27-016, F-M27-006 |
| H-M27-006 | Automatisierte Bewerber-Kommunikation (schnelle Eingangsbestätigung, Status, wertschätzende Absagen) | 3 | R4a/R2b; F-M27-006, F-M27-015 |
| H-M27-007 | Social-Recruiting-/Kampagnen-Assistent (KI-gestützte Zielgruppen-Ansprache) | 3 | R2a; F-M27-022 |
| H-M27-008 | Azubi-/Nachwuchs-Pipeline-Tracker (Schulkontakte, Praktika, Übernahme-Verlauf) | 2 | R3; F-M27-007, F-M27-008, F-M27-017 |
| H-M27-009 | Vergütungs-/Benefit-Benchmark (Marktvergleich Region/Kanzleigröße) | 3 | R5a; F-M27-009, F-M27-018 |
| H-M27-010 | Recruiting-Kanal-ROI-Analyse (Kosten je Einstellung, welcher Kanal rechnet sich) | 4 | R6b; F-M27-020, F-M27-004 |
| H-M27-011 | Vorausschauende Recruiting-Steuerung (Bedarf aus Personalplanung → kontinuierlicher Talent-Pool statt Reaktion) | 4 | R6a; F-M27-010, F-M27-011 |

## 6. Output-Contract (`metadata.output_contract`)

Aus den M-27-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. EVP/Wunschprofil festlegen, in Ausbildung/Azubi-Kanal investieren, Vergütung/Benefits nachziehen, Recruiting-Verantwortung/Budget vergeben, Kanal einstellen/ausbauen).
- `standard` — welche Norm/Routine gilt (z. B. Reaktionszeit auf Bewerbungen, gepflegte Karriereseite + Bewertungsprofile, strukturiertes Auswahlverfahren, kontinuierliche statt reaktive Beschaffung, Azubi-Pipeline-Rhythmus).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Karriereseite überarbeiten, kununu-Profil aktivieren, Multi-Channel-Ausschreibung aufsetzen, Mitarbeiter-werben-Programm starten, Schul-/Praktikums-Kontakt terminieren).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m27`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
