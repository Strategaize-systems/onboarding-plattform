# M-38 Seed-Source — IT-Sicherheit, Backups & Ausfallrisiken (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m38` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-02 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-38 ist die **Standortbestimmung der IT-Sicherheit,
> Backups & Ausfallrisiken** — Datensicherheit/Mandantengeheimnis (§203), Zugriffs-/Berechtigungs-
> konzept, Backup, IT-Ausfall/Notfall, Cyber-Bedrohung/Awareness, Sicherheits-Steuerung. **Kein
> IT-Sicherheits-Audit und keine Rechts-/DSGVO-Beratung** — Selbst-Diagnose, die Sicherheits-Lücken
> sichtbar macht; konkrete Umsetzung erfordert IT-Dienstleister / Datenschutzbeauftragten. Bewusst
> getrennt von der *Systemlandschaft/Integration/KI-Einsatz* (M-36), der *rechtlichen* Notfall-/
> §69-Vertretung (M-35), der *strukturellen* Ausfall-Redundanz (M-02) und dem *personellen*
> Offboarding (M-28/M-26). Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-02 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> IT-Sicherheit / Backup / Ausfall Steuerkanzlei (IT, Daten & Tools; StB-Begründung „Mandantendaten-
> Sensibilität (DSGVO)"; xlsx „Backup-Strategie, Notfallpläne, Passwort- und Berechtigungskonzepte,
> Ausfallrisiken"). Blueprint-Anker: `d2_systemlandschaft` **primär** m38 (sekundär m36). Tiefen-/
> Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-15/M-16/M-36/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`.
> Kein recyceltes exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m38` |
| `version` | `1.0` |
| `name` | M-38 – IT-Sicherheit, Backups & Ausfallrisiken |
| Kategorie | IT, Daten & Tools (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m38` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
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
| Frage-ID (F-M38-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (T1..T6 / Txa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `T` = iT-Sicherheit (M-38-modul-scoped) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell T1–T6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); IT-Sicherheits-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-38-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m38`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| T1 | Datensicherheit & Mandantengeheimnis (§203) | `t1a_mandantendaten_schutz` | Technischer Schutz sensibler Mandantendaten (Verschlüsselung, sichere Übertragung/Ablage) |
| | | `t1b_ki_tool_regel_203` | Regel, welche KI-Tools mit Mandantenbezug erlaubt sind (§203/Schatten-KI) |
| | | `t1c_dsgvo_compliance` | DSGVO-Konformität (Verarbeitungsverzeichnis, AV-Verträge, Löschkonzept) |
| T2 | Zugriffs- & Berechtigungskonzept | `t2a_berechtigungskonzept` | Rollen-/Rechtekonzept (wer sieht/darf was) |
| | | `t2b_passwort_zugaenge` | Passwort-/Zugangs-Sicherheit (MFA, geteilte Passwörter) |
| | | `t2c_offboarding_zugaenge` | Zugänge bei Austritt entzogen (Grenze: personelles Offboarding → M-28/M-26) |
| T3 | Backup & Datensicherung | `t3a_backup_strategie` | Backup-Strategie (was/wie oft/wohin) |
| | | `t3b_wiederherstellung_getestet` | Wiederherstellung getestet (nicht nur „läuft") |
| | | `t3c_datenverlust_szenario` | Datenverlust-Szenario (Ransomware, Hardware-Crash) |
| T4 | Ausfall & Notfallplan (IT) | `t4a_it_ausfallrisiko` | Kritische IT-Ausfallrisiken (Server, Internet, DATEV, zentrale Systeme) |
| | | `t4b_notfallplan` | Notfallplan/Runbook für IT-Ausfall (Grenze: §69/Struktur → M-35/M-02) |
| | | `t4c_handlungsfaehigkeit` | Wiederanlauf-Zeit / Handlungsfähigkeit bei IT-Ausfall |
| T5 | Cyber-Bedrohung & Awareness | `t5a_cyber_schutz` | Technische Schutzmaßnahmen (Firewall, Endpoint, Updates, sichere Mail) |
| | | `t5b_awareness_team` | Mitarbeiter-Awareness (Phishing, Social Engineering) |
| | | `t5c_vorfall_erfahrung` | Bisherige Sicherheitsvorfälle / Vorbereitung |
| T6 | Sicherheits-Steuerung & Reife | `t6a_security_ownership` | Wer verantwortet IT-Sicherheit (Grenze: allg. IT-Ownership → M-36 i6a) |
| | | `t6b_datev_cloud_sicherheit` | DATEV-Cloud aus Sicherheits-/Datenschutz-Sicht (Grenze: System-Readiness → M-36 i1c) |
| | | `t6c_sicherheits_reife` | Bewusste Sicherheits-Strategie vs. „wird schon nichts passieren" |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen den bisherigen StB-Seed-Korpus M-01…M-42)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M38-001 | `t1a_mandantendaten_schutz` | Wie schützen Sie die sensiblen Mandantendaten in Ihrer Kanzlei technisch (verschlüsselte Ablage, sichere Übertragung, Zugriffsschutz) — oder liegen viele Daten faktisch ungeschützt auf Laufwerken und in Mail-Postfächern? | Ergänzung |
| 2 | F-M38-002 | `t1b_ki_tool_regel_203` | Haben Sie eine klare Regel, welche KI-Tools mit Mandantenbezug erlaubt sind und welche nicht — im Hinblick auf das Mandantengeheimnis (§203 StGB)? | Variante von F-BP-010 (d2-Diagnose, primäres Zielmodul m38; hier die §203-/Schatten-KI-Seite; Grenze: der produktive KI-Einsatz selbst → M-36 I3) |
| 3 | F-M38-003 | `t2a_berechtigungskonzept` | Gibt es ein klares Rollen-/Rechtekonzept — wer in Ihrer Kanzlei auf welche Daten und Systeme zugreifen darf — oder hat faktisch fast jeder Zugriff auf fast alles? | Ergänzung |
| 4 | F-M38-004 | `t2b_passwort_zugaenge` | Wie sicher sind Ihre Zugänge (starke Passwörter, Mehr-Faktor-Authentifizierung) — oder gibt es geteilte Passwörter, Notizzettel und Konten, die mehrere nutzen? | Ergänzung |
| 5 | F-M38-005 | `t3a_backup_strategie` | Haben Sie eine Backup-Strategie, die klar regelt, was wie oft und wohin gesichert wird — oder verlassen Sie sich darauf, dass „das der Dienstleister/die Cloud schon macht"? | Ergänzung |
| 6 | F-M38-006 | `t3b_wiederherstellung_getestet` | Haben Sie schon einmal getestet, ob sich Ihre Daten aus dem Backup tatsächlich wiederherstellen lassen — oder wissen Sie nur, dass „irgendwas gesichert wird"? | Ergänzung |
| 7 | F-M38-007 | `t4a_it_ausfallrisiko` | Welche IT-Ausfälle würden Ihre Kanzlei am härtesten treffen (Server, Internet, DATEV, zentrale Software) — und wie lange könnten Sie ohne diese Systeme überhaupt arbeiten? | Ergänzung |
| 8 | F-M38-008 | `t4b_notfallplan` | Gibt es einen Notfallplan für einen IT-Ausfall oder Sicherheitsvorfall (wer tut was, wen rufen Sie an) — oder würden Sie im Ernstfall improvisieren? | Ergänzung (Grenze: die personelle/Berufsträger-Vertretung → M-35 §69 / M-02; hier der IT-Notfall) |
| 9 | F-M38-009 | `t6a_security_ownership` | Wer ist bei Ihnen für IT-Sicherheit verantwortlich (interne Rolle, IT-Dienstleister, faktisch niemand) — und kümmert sich jemand aktiv darum, oder läuft es „bis etwas passiert"? | Ergänzung (Grenze: allgemeines IT-/System-Ownership → M-36 i6a; hier die Sicherheits-Verantwortung) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M38-010 | `t1c_dsgvo_compliance` | Ist Ihre Datenverarbeitung DSGVO-konform aufgesetzt (Verarbeitungsverzeichnis, AV-Verträge mit Dienstleistern, Löschkonzept) — oder ist das seit Einführung nie wirklich sauber gemacht worden? | Ergänzung |
| 11 | F-M38-011 | `t2c_offboarding_zugaenge` | Werden bei einem Mitarbeiter-Austritt zuverlässig alle Zugänge und Rechte entzogen (Systeme, DATEV, Mail, Cloud) — oder existieren noch aktive Konten von längst ausgeschiedenen Personen? | Ergänzung (Grenze: der personelle Offboarding-Prozess → M-28/M-26; hier die IT-seitige Zugangs-Entziehung) |
| 12 | F-M38-012 | `t3c_datenverlust_szenario` | Was würde konkret passieren, wenn Ihre Kanzleidaten morgen durch Ransomware verschlüsselt oder durch einen Hardware-Crash zerstört wären — wie schnell wären Sie wieder arbeitsfähig? | Ergänzung |
| 13 | F-M38-013 | `t4c_handlungsfaehigkeit` | Wie schnell wären Sie nach einem IT-Ausfall wieder handlungsfähig, ohne dass Fristen platzen — Stunden, Tage, oder ist das völlig offen? | Ergänzung (Grenze: die Fristen-/Zeichnungs-Absicherung strukturell → M-02 s4c; hier die IT-Wiederanlauf-Zeit) |
| 14 | F-M38-014 | `t5a_cyber_schutz` | Welche technischen Schutzmaßnahmen haben Sie (Firewall, Virenschutz/Endpoint, aktuelle Updates, sichere Mail) — und wer stellt sicher, dass das aktuell bleibt? | Ergänzung |
| 15 | F-M38-015 | `t5b_awareness_team` | Sind Ihre Mitarbeiter für Cyber-Risiken sensibilisiert (Phishing-Mails erkennen, keine Daten leichtfertig teilen) — oder wäre ein täuschend echtes Phishing bei Ihnen wahrscheinlich erfolgreich? | Ergänzung |
| 16 | F-M38-016 | `t5c_vorfall_erfahrung` | Hatten Sie schon einmal einen Sicherheitsvorfall (Phishing, Datenverlust, Angriff) — und was haben Sie daraus abgeleitet, oder blieb es folgenlos? | Ergänzung |
| 17 | F-M38-017 | `t6b_datev_cloud_sicherheit` | Betrachten Sie die DATEV-Cloud-Umstellung auch aus Sicherheits-/Datenschutz-Sicht (wo liegen Daten, wer hat Zugriff, §203) — oder nur als technische Umstellung? | Variante von F-BP-010 (d2-Diagnose, DATEV-Cloud-Teil, primäres Zielmodul m38 aus Sicherheits-Sicht; Grenze: die System-/Integrations-Readiness → M-36 i1c) |

> **Auto-Dedup-Befund:** M-38 (IT-Sicherheit, Backups & Ausfallrisiken) ist als eigene
> Sicherheits-Domäne weitgehend frisch — **15 Ergänzungen, 2 Varianten**. Beide Varianten liegen
> auf `d2_systemlandschaft/Datensicherheit` (F-BP-010, primäres Zielmodul m38): **F-M38-002**
> (§203-/KI-Tool-Regel-Seite) und **F-M38-017** (DATEV-Cloud aus Sicherheits-Sicht). Der Blueprint
> bündelt Systemlandschaft + Datensicherheit in einer d2-Frage; M-38 nimmt die **Sicherheits-/§203-/
> DATEV-Cloud-Compliance-Seite**, während M-36 (F-M36-010/013) die **System-/Integrations-/
> Belegquote-Readiness-Seite** hält. Grenzen sauber gezogen: **M-36** (Systemlandschaft/Integration/
> KI-*Einsatz* — M-38 = Sicherheit/Backup/§203), **M-35** (§69-Berufsträger-Vertretung *rechtlich* —
> M-38 = IT-Ausfall/Notfall technisch), **M-02** (Ausfall-*Struktur*/Fristen — M-38 = IT-Wiederanlauf),
> **M-28/M-26** (Offboarding *personell* — M-38 = IT-Zugangs-Entziehung), **M-37** (Datenqualität —
> nicht im Cut; M-38 = Berechtigungen/Sicherheit). **Bewusst gedeckelt** (Founder-Entscheid
> „schlanker", nicht stillschweigend gefüllt): `t6c_sicherheits_reife` ist im Themenbaum angelegt,
> aber in v1.0 ohne eigene Frage (implizit in F-M38-009 + Reife-Radar-Hebel) — v1.1-Kandidat.
> DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M38-001 | Mandantendaten-/§203-Schutz-Check (sensible Daten + KI-Tool-Regel mit Mandantenbezug prüfen) | 2 | T1; F-M38-001, F-M38-002 |
| H-M38-002 | Berechtigungs-/Zugriffs-Analyse (Rollen-/Rechtekonzept, verwaiste Konten, Passwort-Sicherheit) | 2 | T2; F-M38-003, F-M38-004, F-M38-011 |
| H-M38-003 | Backup-/Wiederherstellungs-Check (Backup-Strategie + Restore-Test-Plan) | 2 | T3; F-M38-005, F-M38-006 |
| H-M38-004 | IT-Notfallplan-/Runbook-Generator (Ausfallrisiken + Notfallplan + Wiederanlauf) | 3 | T4; F-M38-007, F-M38-008, F-M38-013 |
| H-M38-005 | Ransomware-/Datenverlust-Szenario-Simulation (Auswirkung + Vorbereitung durchspielen) | 3 | T3c; F-M38-012 |
| H-M38-006 | Phishing-/Awareness-Trainer (Mitarbeiter-Sensibilisierung, simulierte Phishing-Checks) | 3 | T5b; F-M38-015 |
| H-M38-007 | DSGVO-/Compliance-Check (Verarbeitungsverzeichnis, AV-Verträge, Löschkonzept strukturieren) | 2 | T1c; F-M38-010 |
| H-M38-008 | IT-Sicherheits-Reife-Radar (Datenschutz, Zugriff, Backup, Ausfall, Awareness — Gesamtbild) | 4 | T1–T6; F-M38-001, F-M38-005, F-M38-009 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-38-Output):** Selbst-Diagnose der IT-Sicherheit, **kein
> IT-Sicherheits-Audit und keine Rechts-/DSGVO-Beratung**. Die Ausgabe strukturiert die eigenen
> Angaben und macht Sicherheits-/Ausfall-Lücken sichtbar; konkrete Umsetzung erfordert
> IT-Dienstleister / Datenschutzbeauftragten.

Aus den M-38-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. eine KI-Tool-/§203-Regel einführen, ein
  Berechtigungskonzept aufsetzen, MFA verpflichtend machen, eine getestete Backup-Strategie
  festlegen, einen IT-Notfallplan erstellen, IT-Sicherheits-Verantwortung benennen).
- `standard` — welche Norm/Routine gilt (z. B. dokumentiertes Rechtekonzept, regelmäßig getestetes
  Backup, IT-Notfallplan, §203-konforme KI-Nutzung, DSGVO-Dokumentation, Awareness-Routine,
  Zugangs-Entzug bei Austritt).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Restore-Test durchführen, MFA
  aktivieren, KI-Tool-Regel schreiben, verwaiste Konten deaktivieren, Notfallplan-Runbook anlegen,
  Phishing-Awareness-Check machen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m38`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
