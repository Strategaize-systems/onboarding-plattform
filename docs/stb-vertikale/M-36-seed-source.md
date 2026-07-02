# M-36 Seed-Source — Systemlandschaft & Integrationen (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m36` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-02 (SLC-170b, DEC-242 · Modus A / `/module-author`).
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-36 ist die **Standortbestimmung der
> Systemlandschaft & KI-Readiness** — Kern-Systeme, Integration/Medienbrüche, produktiver
> KI-Einsatz, Prozess-Automatisierung, digitale Reife, IT-Steuerung. **KI-Readiness-Kern der
> Vertikale.** Bewusst getrennt von der *IT-Sicherheit/§203/Backups/Ausfall* (M-38), den *KPIs aus
> den Systemen* (M-07), dem *KI-Modelleffekt* (M-01) und dem *KI-Personalbedarf* (M-26). Alle Fragen
> sind offen; die KI-Hebel strukturieren/prüfen. Dieser Framing-Hinweis gehört in
> `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-02 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Systemlandschaft / Integrationen Steuerkanzlei (IT, Daten & Tools; StB-Begründung „DATEV-
> Verzahnung, KI-Readiness-Kern"). Blueprint-Anker: `d1_ki_einsatz` **primär** m36 (sekundär m07);
> `d2_systemlandschaft` **sekundär** m36 (primär m38). Tiefen-/Format-Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-15/M-16/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`.
> Kein recyceltes exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m36` |
| `version` | `1.0` |
| `name` | M-36 – Systemlandschaft & Integrationen |
| Kategorie | IT, Daten & Tools (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m36` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
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
| Frage-ID (F-M36-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (I1..I6 / Ixa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `I` = IT-Systemlandschaft (M-36-modul-scoped) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell I1–I6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); IT-/Digital-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-36-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m36`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| I1 | Systemlandschaft & Kern-Tools | `i1a_kern_systeme` | Kern-Systeme (DATEV, Kanzleisoftware, DMS, Zeiterfassung) (Grenze: KPIs → M-07) |
| | | `i1b_tool_wildwuchs` | Geordnete Tool-Landschaft vs. Wildwuchs/Insellösungen/Excel-Zoo |
| | | `i1c_datev_cloud_stand` | DATEV-Cloud-Umstellung (ab Herbst 2026) — Stand/Plan (Grenze: als Sicherheit/§203 → M-38) |
| I2 | Integration & Medienbrüche | `i2a_integration_grad` | Integrationsgrad vs. isolierte Systeme |
| | | `i2b_medienbrueche` | Medienbrüche/Doppelerfassung |
| | | `i2c_schnittstellen_mandant` | Schnittstellen zum Mandanten (Portal/Bank/Upload vs. Mail/Papier) |
| I3 | KI-Einsatz (produktiv) | `i3a_ki_produktiv` | Wo KI produktiv (FiBu/Beleg/Kommunikation, nicht nur Recherche) |
| | | `i3b_ki_abdeckung` | Bei welchem Anteil Mandate/Prozesse KI im Einsatz |
| | | `i3c_ki_potenzial` | Größtes ungenutztes KI-/Automatisierungs-Potenzial (Grenze: Modelleffekt → M-01, Personal → M-26) |
| I4 | Prozess-Automatisierung | `i4a_automatisierte_prozesse` | Welche Routineprozesse automatisiert vs. manuell |
| | | `i4b_belegquote_erfassung` | Digitale Belegquote & automatisierte Erfassung (Grenze: als DATEV-Cloud/Compliance → M-38) |
| | | `i4c_automatisierungs_stand` | Systematisch automatisieren vs. Einzelfall |
| I5 | Digitale Reife & Mandanten-Digitalisierung | `i5a_digitalisierungsgrad` | Digitalisierungsgrad der Kanzlei insgesamt |
| | | `i5b_mandanten_digital` | Digitalisierungsgrad der Mandanten (analoge Belege, Portal) |
| | | `i5c_digitale_zusammenarbeit` | Digitale Zusammenarbeit intern/mit Mandanten (Grenze: sichere Übergabe → M-38) |
| I6 | IT-Steuerung & Zukunftsfähigkeit | `i6a_it_ownership` | Wer verantwortet IT/Systemauswahl (Grenze: Rollen → M-02) |
| | | `i6b_digital_strategie` | Bewusste IT-/Digitalisierungs-Strategie vs. gewachsen |
| | | `i6c_zukunftsfaehigkeit` | Zukunftsfähigkeit der Landschaft (KI-/DATEV-Cloud-fähig) (Grenze: Sicherheit/Backup → M-38) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen den bisherigen StB-Seed-Korpus M-01…M-42)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M36-001 | `i1a_kern_systeme` | Welche Kern-Systeme setzen Sie in der Kanzlei ein (DATEV, Kanzleisoftware, Dokumentenmanagement, Zeiterfassung, Kommunikation) — und haben Sie einen klaren Überblick, was wofür genutzt wird? | Ergänzung (Grenze: KPIs aus diesen Systemen → M-07; hier die Systemlandschaft selbst) |
| 2 | F-M36-002 | `i1b_tool_wildwuchs` | Ist Ihre Tool-Landschaft geordnet — oder eher gewachsener Wildwuchs mit Insellösungen und einem „Excel-Zoo" daneben? | Ergänzung |
| 3 | F-M36-003 | `i2a_integration_grad` | Wie gut sind Ihre Systeme miteinander verbunden — fließen Daten automatisch, oder arbeiten die Systeme weitgehend isoliert nebeneinander? | Ergänzung |
| 4 | F-M36-004 | `i2b_medienbrueche` | Welcher Anteil Ihrer Mandanten liefert Belege noch analog / mit Medienbruch — und wo erfassen Sie mangels Schnittstelle doppelt? | Variante von F-BP-019 (d1-Diagnose, primäres Zielmodul m36; hier operativ vertieft) |
| 5 | F-M36-005 | `i3a_ki_produktiv` | Wo setzen Sie KI in Ihrer Kanzlei heute produktiv ein — nur zum Recherchieren, oder auch in FiBu/Belegverarbeitung/Mandantenkommunikation? | Variante von F-BP-009 (d1-Diagnose, primäres Zielmodul m36; hier operativ vertieft; Grenze: KI-Modelleffekt → M-01, Personalbedarf → M-26) |
| 6 | F-M36-006 | `i3b_ki_abdeckung` | Bei welchem Anteil Ihrer Mandate oder Prozesse ist KI/Automatisierung heute wirklich im Einsatz — flächendeckend, in Pilotinseln, oder faktisch gar nicht? | Variante von F-BP-009 (Abdeckungs-Teil der d1-Frage; hier vertieft) |
| 7 | F-M36-007 | `i4a_automatisierte_prozesse` | Welche Routineprozesse in Ihrer Kanzlei laufen automatisiert (z. B. Belegabruf, Buchungsvorschläge, Fristenmonitoring, Mandanten-Erinnerungen) — und welche machen Sie noch komplett manuell? | Ergänzung |
| 8 | F-M36-008 | `i5a_digitalisierungsgrad` | Wie würden Sie den Digitalisierungsgrad Ihrer Kanzlei insgesamt einschätzen — durchgehend digital, teils-teils, oder in vielem noch papier-/manuell-getrieben? | Ergänzung |
| 9 | F-M36-009 | `i6b_digital_strategie` | Steckt hinter Ihrer System-/IT-Landschaft eine bewusste Digitalisierungsstrategie — oder ist sie über die Jahre gewachsen, ohne dass jemand das Gesamtbild steuert? | Ergänzung (Grenze: IT-Sicherheit/Backup/Ausfall → M-38; hier die System-/Digital-Strategie) |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M36-010 | `i1c_datev_cloud_stand` | Wie ist Ihr Stand bei der DATEV-Cloud-Umstellung (ab Herbst 2026) — haben Sie einen Plan, wie Ihre Systemlandschaft darauf umgestellt wird? | Variante von F-BP-010 (d2-Diagnose, sekundäres Zielmodul m36; hier die Systemlandschafts-/Readiness-Seite; Grenze: §203/Datensicherheit/Ausfall → M-38) |
| 11 | F-M36-011 | `i2c_schnittstellen_mandant` | Über welche Schnittstellen kommen Mandantendaten zu Ihnen (Portal, Upload, Bank-Schnittstelle, DATEV Unternehmen online) — oder läuft vieles per Mail/Papier/Schuhkarton? | Ergänzung |
| 12 | F-M36-012 | `i3c_ki_potenzial` | Wo läge in Ihrer Kanzlei das größte ungenutzte Potenzial für KI/Automatisierung — welcher zeitfressende Prozess schreit danach? | Ergänzung (Grenze: der Umsatz-/Modelleffekt → M-01 b5, der Personalbedarfs-Effekt → M-26 F-M26-019; hier der System-/Prozess-Hebel) |
| 13 | F-M36-013 | `i4b_belegquote_erfassung` | Kennen Sie Ihre digitale Belegquote, und wie automatisiert ist die Belegerfassung (OCR, Buchungsvorschläge, direkte Bankdaten) — oder wird viel noch manuell abgetippt? | Variante von F-BP-010 (Belegquote-Teil der d2-Frage; hier als Automatisierungs-/Systemhebel; Grenze: Belegquote als DATEV-Cloud-/Compliance-Thema → M-38) |
| 14 | F-M36-014 | `i4c_automatisierungs_stand` | Automatisieren Sie systematisch (Sie schauen aktiv, wo sich Prozesse automatisieren lassen) — oder passiert das nur zufällig, wenn ein Tool es zufällig mitbringt? | Ergänzung |
| 15 | F-M36-015 | `i5b_mandanten_digital` | Wie digital sind Ihre Mandanten aufgestellt — nutzen sie Portale/digitale Belege — und wie gehen Sie mit den analog-getriebenen Mandanten um? | Ergänzung |
| 16 | F-M36-016 | `i5c_digitale_zusammenarbeit` | Wie digital arbeiten Sie intern und mit Mandanten zusammen (Portal, sichere Dokumentenübergabe, digitale Signatur, gemeinsame Ablage) — oder dominiert Mail-Anhang und Papier? | Ergänzung (Grenze: sichere Übergabe/Verschlüsselung als Sicherheitsthema → M-38; hier die digitale Zusammenarbeit) |
| 17 | F-M36-017 | `i6a_it_ownership` | Wer verantwortet bei Ihnen IT und Systemauswahl (interne Rolle, externer Dienstleister, der Inhaber nebenbei) — und ist jemand für die digitale Weiterentwicklung zuständig? | Ergänzung (Grenze: Rollen/Governance → M-02; IT-Sicherheits-Verantwortung → M-38; hier das System-/Digital-Ownership) |

> **Auto-Dedup-Befund:** M-36 (Systemlandschaft & Integrationen) trägt als **KI-Readiness-Kern**
> die Blueprint-D-Diagnostik — **14 Ergänzungen, 3 Varianten**. Die Varianten liegen auf den
> D-Ankern, deren Zielmodul m36 ist: **F-M36-005/006 ↔ F-BP-009** (`d1_ki_einsatz`, primär m36 —
> KI-produktiv + Abdeckung), **F-M36-004 ↔ F-BP-019** (`d1`, Medienbrüche) und **F-M36-010/013 ↔
> F-BP-010** (`d2_systemlandschaft`, sekundär m36 — DATEV-Cloud-Readiness + Belegquote-als-
> Automatisierung). Der Blueprint diagnostiziert; M-36 vertieft die *System-/Integrations-/
> Automatisierungs-Seite*. Grenzen sauber gezogen: **M-38** (IT-*Sicherheit*/Backup/Ausfall/**§203**/
> Datensicherheit — `d2` primär m38; DATEV-Cloud/Belegquote als *Compliance/Sicherheit*), **M-07**
> (KPIs *aus* den Systemen — M-36 = die Systeme), **M-01** (KI-*Modelleffekt*), **M-26** (KI-*
> Personalbedarf* — beide defern die *Systemwahl* hierher, F-M01-009/015, F-M02-016), **M-02**
> (Rollen/Ownership), **M-37** (Datenqualität/Rechte — nicht im Cut). **Bewusst gedeckelt**
> (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt): `i6c_zukunftsfaehigkeit` ist im
> Themenbaum angelegt, aber in v1.0 ohne eigene Frage (implizit in F-M36-009/010; Grenze Sicherheit
> → M-38) — v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M36-001 | Systemlandschafts-Landkarte (alle Systeme + Integrationen + Insellösungen sichtbar machen) | 2 | I1/I2; F-M36-001, F-M36-002, F-M36-003 |
| H-M36-002 | Medienbruch-/Doppelerfassungs-Radar (wo analog/doppelt erfasst wird, Integrations-Kandidaten) | 2 | I2b; F-M36-004, F-M36-011 |
| H-M36-003 | KI-Einsatz-Assessment (wo KI heute produktiv läuft + größte ungenutzte Potenziale) | 3 | I3; F-M36-005, F-M36-006, F-M36-012 |
| H-M36-004 | Prozess-Automatisierungs-Finder (Routineprozesse mit Automatisierungspotenzial identifizieren + priorisieren) | 3 | I4; F-M36-007, F-M36-013, F-M36-014 |
| H-M36-005 | DATEV-Cloud-Readiness-Check (Stand + Plan für die Umstellung, systemseitig) | 2 | I1c; F-M36-010 (Grenze: Sicherheit/§203 → M-38) |
| H-M36-006 | Belegquote-/digitale-Erfassungs-Optimierer (Belegquote heben, Erfassung automatisieren) | 3 | I4b; F-M36-013 |
| H-M36-007 | Mandanten-Digitalisierungs-Assistent (Mandanten auf digitale Belege/Portale heben) | 2 | I5b; F-M36-015, F-M36-016 |
| H-M36-008 | KI-/Digital-Readiness-Radar (Systemlandschaft, Integration, KI-Einsatz, DATEV-Cloud-Fähigkeit — Gesamtbild) | 4 | I1–I6; F-M36-005, F-M36-009, F-M36-010 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-36-Output):** Selbst-Diagnose der Systemlandschaft & KI-Readiness,
> keine IT-/Systemhaus-Beratung im Einzelfall. Die Ausgabe strukturiert die eigenen Angaben und
> macht Integrations-/Automatisierungs-/KI-Hebel sichtbar.

Aus den M-36-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Insellösungen konsolidieren, eine Integration
  schaffen, KI in einem Prozess produktiv einführen, Belegquote-Ziel setzen, DATEV-Cloud-Umstellung
  planen, IT-Ownership festlegen).
- `standard` — welche Norm/Routine gilt (z. B. dokumentierte Systemlandschaft, integrierte
  Kern-Systeme ohne Doppelerfassung, definierter KI-/Automatisierungs-Einsatz je Prozess, digitale
  Mandanten-Schnittstellen, regelmäßiger System-/Digital-Review).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Systemlandkarte erstellen,
  Medienbruch schließen, KI-Pilot in einem Prozess starten, Belegquote messen/heben,
  DATEV-Cloud-Readiness prüfen).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m36`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
